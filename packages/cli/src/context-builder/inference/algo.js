/**
 * Phase 1 — Algorithmic inference for the Context Builder.
 *
 * Wraps utils/detect-stack.js and produces a partial frontmatter draft
 * shaped for schema v1, plus a confidence map and the list of files
 * actually read.
 *
 * Output is partial:
 *  - project.description, tier.rationale → filled by Phase 2 (LLM)
 *  - project.mode                          → injected by caller
 *  - pending_decisions on tier upgrade-cap → added here when suggested
 *                                            tier exceeds v1 schema (M/L)
 *  - PM review (Phase 3)                   → may upgrade confidence to "declared"
 *
 * See memory: project_context_builder_inference_v1.md
 */
import fs from 'fs-extra';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { detectStack } from '../../utils/detect-stack.js';

const MANIFEST_NAME_READERS = [
  {
    file: 'package.json',
    read: async (p) => (await fs.readJson(p).catch(() => ({})))?.name ?? null,
  },
  {
    file: 'pyproject.toml',
    read: async (p) => extractTomlField(await fs.readFile(p, 'utf8').catch(() => ''), 'name'),
  },
  {
    file: 'Cargo.toml',
    read: async (p) => extractTomlField(await fs.readFile(p, 'utf8').catch(() => ''), 'name'),
  },
];

function extractTomlField(content, key) {
  if (!content) return null;
  const re = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, 'm');
  const m = content.match(re);
  return m ? m[1] : null;
}

async function readProjectNameFromManifest(dir) {
  for (const { file, read } of MANIFEST_NAME_READERS) {
    const p = path.join(dir, file);
    if (await fs.pathExists(p)) {
      const v = await read(p);
      if (v) return { name: v, file };
    }
  }
  return null;
}

function hasGithubRemote(dir) {
  try {
    const remotes = execSync('git remote -v', { cwd: dir, stdio: 'pipe' }).toString();
    return /(?:^|[@/])github\.com[:/]/.test(remotes);
  } catch {
    return false;
  }
}

async function hasExplicitTestScript(dir, techStack) {
  if (techStack !== 'node-ts' && techStack !== 'node-js') return false;
  const pkg = await fs.readJson(path.join(dir, 'package.json')).catch(() => ({}));
  const t = pkg?.scripts?.test;
  return Boolean(t && t !== 'echo "Error: no test specified"');
}

async function hasExplicitDevScript(dir, techStack) {
  if (techStack !== 'node-ts' && techStack !== 'node-js') return false;
  const pkg = await fs.readJson(path.join(dir, 'package.json')).catch(() => ({}));
  return Boolean(pkg?.scripts?.dev);
}

/**
 * Cap detect-stack's suggested tier to the v1 schema enum {'0', 's'}.
 * Suggested 'm' or 'l' become 's' but a pending decision is recorded
 * so the PM is forced to revisit during Phase 3 review.
 */
function capTierForV1(suggested) {
  if (suggested === 's') return { capped: 's', overflow: null };
  if (suggested === 'm' || suggested === 'l') return { capped: 's', overflow: suggested };
  return { capped: 's', overflow: null };
}

/**
 * Run Phase 1 algorithmic inference on a directory.
 *
 * @param {string} dir - Project root to inspect
 * @returns {Promise<{ draft: object, confidence: object, source_files: string[], pending_decisions: Array<{field, reason}> }>}
 */
export async function runAlgoInference(dir) {
  const detected = await detectStack(dir);
  const sourceFiles = [...detected.detectedFiles];

  // ── project.name ───────────────────────────────────────────────────
  const manifestName = await readProjectNameFromManifest(dir);
  const projectName = manifestName?.name ?? path.basename(path.resolve(dir));
  const nameConfidence = manifestName ? 'high' : 'medium';
  if (manifestName && !sourceFiles.includes(manifestName.file)) {
    sourceFiles.push(manifestName.file);
  }

  // ── commands ───────────────────────────────────────────────────────
  // detect-stack.js ships generic defaults (e.g. testCommand="npm test")
  // even when techStack==="other"; those defaults are misleading on
  // unrecognized projects, so we omit commands entirely in that case.
  const commands = {};
  if (detected.techStack !== 'other') {
    if (detected.installCommand) commands.install = detected.installCommand;
    if (detected.testCommand) commands.test = detected.testCommand;
    if (detected.typeCheckCommand) commands.type_check = detected.typeCheckCommand;
    if (detected.devCommand) commands.dev = detected.devCommand;
  }

  // ── scaffold_options.include_pre_commit ────────────────────────────
  const preCommitFile = path.join(dir, '.pre-commit-config.yaml');
  const preCommitExists = await fs.pathExists(preCommitFile);
  if (preCommitExists && !sourceFiles.includes('.pre-commit-config.yaml')) {
    sourceFiles.push('.pre-commit-config.yaml');
  }

  // ── scaffold_options.include_github ────────────────────────────────
  const githubDir = path.join(dir, '.github');
  const githubDirExists = await fs.pathExists(githubDir);
  if (githubDirExists && !sourceFiles.includes('.github/')) {
    sourceFiles.push('.github/');
  }
  const githubRemote = hasGithubRemote(dir);

  // ── tier ───────────────────────────────────────────────────────────
  const { capped, overflow } = capTierForV1(detected.suggestedTier);

  // ── confidence ─────────────────────────────────────────────────────
  const confidence = {
    'project.name': nameConfidence,
    'stack.primary': detected.techStack === 'other' ? 'low' : 'high',
    'tier.selected': 'medium',
  };
  if (commands.install) confidence['commands.install'] = 'high';
  if (commands.test) {
    const explicit = await hasExplicitTestScript(dir, detected.techStack);
    confidence['commands.test'] = explicit ? 'high' : 'medium';
  }
  if (commands.type_check) confidence['commands.type_check'] = 'high';
  if (commands.dev) {
    const explicit = await hasExplicitDevScript(dir, detected.techStack);
    confidence['commands.dev'] = explicit ? 'high' : 'medium';
  }
  confidence['scaffold_options.include_pre_commit'] = preCommitExists ? 'high' : 'medium';
  if (githubDirExists && githubRemote) {
    confidence['scaffold_options.include_github'] = 'high';
  } else if (githubDirExists || githubRemote) {
    confidence['scaffold_options.include_github'] = 'medium';
  } else {
    confidence['scaffold_options.include_github'] = 'low';
  }

  // ── pending_decisions ──────────────────────────────────────────────
  const pendingDecisions = [];
  if (overflow) {
    pendingDecisions.push({
      field: 'tier.selected',
      reason: `Auto-detected tier=${overflow.toUpperCase()} but v1 schema caps to 0/S. Confirm tier or use legacy wizard for M/L.`,
    });
  }

  // ── draft ──────────────────────────────────────────────────────────
  const draft = {
    project: { name: projectName },
    stack: { primary: detected.techStack },
    commands,
    tier: { selected: capped },
    scaffold_options: {
      include_pre_commit: preCommitExists,
      include_github: githubDirExists && githubRemote,
    },
  };

  return {
    draft,
    confidence,
    source_files: sourceFiles,
    pending_decisions: pendingDecisions,
  };
}
