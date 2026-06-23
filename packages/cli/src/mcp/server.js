#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, '..', 'index.js');

function readPackageField(field) {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'package.json'), 'utf8'));
  return pkg[field];
}

function readPackageVersion() {
  return readPackageField('version');
}

function readPackageName() {
  return readPackageField('name');
}

function getCwd() {
  return process.env.TIERWARD_PROJECT_ROOT || process.env.CDK_PROJECT_ROOT || process.cwd();
}

function safeReadJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    return { _error: `parse failed: ${err.message}` };
  }
}

function buildToolReply(payload) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
}

function runDoctorReport(cwd) {
  try {
    const stdout = execFileSync('node', [CLI_PATH, 'doctor', '--report'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(stdout);
  } catch (err) {
    const stdout = (err.stdout || '').toString();
    if (stdout.trim().startsWith('{')) {
      try {
        return JSON.parse(stdout);
      } catch {
        // fall through
      }
    }
    return {
      _error: 'doctor invocation failed',
      message: err.message,
      stdout: stdout.slice(0, 2000),
    };
  }
}

function readTeamSettings(cwd) {
  const file = join(cwd, '.claude', 'team-settings.json');
  if (!existsSync(file)) return { present: false, settings: null };
  const parsed = safeReadJson(file);
  return { present: true, settings: parsed };
}

function readArchAuditStatus(cwd) {
  const file = join(cwd, '.claude', 'session', 'last-arch-audit');
  if (!existsSync(file)) {
    return { everRan: false, lastRunUnix: null, lastRunIso: null };
  }
  try {
    const raw = readFileSync(file, 'utf8').trim();
    const epoch = Number.parseInt(raw, 10);
    if (!Number.isFinite(epoch)) {
      return {
        everRan: true,
        lastRunUnix: null,
        lastRunIso: null,
        _warning: `unparseable: ${raw.slice(0, 40)}`,
      };
    }
    return {
      everRan: true,
      lastRunUnix: epoch,
      lastRunIso: new Date(epoch * 1000).toISOString(),
      ageDays: (Date.now() / 1000 - epoch) / 86400,
    };
  } catch (err) {
    return { everRan: false, lastRunUnix: null, lastRunIso: null, _error: err.message };
  }
}

function readSkillInventory(cwd) {
  const skillsDir = join(cwd, '.claude', 'skills');
  if (!existsSync(skillsDir)) return { skills: [], skillsDir, present: false };
  const entries = readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const skills = [];
  for (const name of entries) {
    const skillFile = join(skillsDir, name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    const raw = readFileSync(skillFile, 'utf8');
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
    const frontmatter = {};
    if (fmMatch) {
      for (const line of fmMatch[1].split('\n')) {
        const m = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
        if (m) frontmatter[m[1]] = m[2].trim();
      }
    }
    skills.push({
      name,
      isCustom: name.startsWith('custom-'),
      bodyLines: raw.split('\n').length,
      description: frontmatter.description || null,
      model: frontmatter.model || null,
      userInvocable: frontmatter['user-invocable'] || null,
      allowedTools: frontmatter['allowed-tools'] || null,
    });
  }
  return { skills, skillsDir, present: true, count: skills.length };
}

function readPrReviewState(prNumber) {
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return { _error: 'prNumber must be a positive integer' };
  }
  const cwd = getCwd();
  let repo;
  try {
    repo = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    return {
      _error: 'gh CLI not available or repo lookup failed',
      message: err.message.slice(0, 200),
    };
  }

  let metadata;
  try {
    const out = execFileSync(
      'gh',
      [
        'pr',
        'view',
        String(prNumber),
        '--repo',
        repo,
        '--json',
        'title,state,headRefName,baseRefName,additions,deletions,changedFiles,url',
      ],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    metadata = JSON.parse(out);
  } catch (err) {
    return {
      _error: `PR #${prNumber} not found or gh access denied`,
      repo,
      message: err.message.slice(0, 200),
    };
  }

  let comments = [];
  try {
    const out = execFileSync(
      'gh',
      ['pr', 'view', String(prNumber), '--repo', repo, '--json', 'comments'],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const parsed = JSON.parse(out);
    comments = Array.isArray(parsed.comments) ? parsed.comments : [];
  } catch {
    // best effort; metadata still useful
  }

  const reviewMarker = '/pr-review — autonomous local review';
  const skillReviews = comments
    .filter((c) => typeof c.body === 'string' && c.body.includes(reviewMarker))
    .map((c) => {
      const body = c.body;
      const verdictMatch = body.match(/### Verdict\s*\n([^\n]+)/);
      const criticalMatch = body.match(/### Critical \((\d+)\)/);
      const majorMatch = body.match(/### Major \((\d+)\)/);
      const minorMatch = body.match(/### Minor \((\d+)\)/);
      return {
        author: c.author?.login || c.author || null,
        createdAt: c.createdAt,
        url: c.url,
        verdict: verdictMatch ? verdictMatch[1].trim() : null,
        critical: criticalMatch ? Number(criticalMatch[1]) : null,
        major: majorMatch ? Number(majorMatch[1]) : null,
        minor: minorMatch ? Number(minorMatch[1]) : null,
        bodyPreview: body.slice(0, 500),
      };
    });

  return {
    repo,
    pr: {
      number: prNumber,
      title: metadata.title,
      state: metadata.state,
      head: metadata.headRefName,
      base: metadata.baseRefName,
      additions: metadata.additions,
      deletions: metadata.deletions,
      changedFiles: metadata.changedFiles,
      url: metadata.url,
    },
    skillReviewComments: skillReviews,
    skillReviewCount: skillReviews.length,
    cliInvocation: `tierward /pr-review ${prNumber}`,
    note:
      skillReviews.length === 0
        ? `No /pr-review skill comment found on this PR yet. Run \`tierward /pr-review ${prNumber}\` (or invoke the skill from Claude Code) to generate one.`
        : `${skillReviews.length} /pr-review skill comment(s) found. Latest verdict: ${skillReviews[skillReviews.length - 1].verdict || 'unknown'}.`,
  };
}

function getPackageMeta() {
  return {
    name: readPackageName(),
    version: readPackageVersion(),
    cliPath: CLI_PATH,
    cwd: getCwd(),
  };
}

export function buildServer() {
  const server = new McpServer({
    name: readPackageName(),
    version: readPackageVersion(),
  });

  // Tool definitions are registered under the `tierward_*` namespace. The
  // legacy `cdk_*` names (the project was formerly claude-dev-kit) are also
  // registered as deprecated aliases sharing the same handler, so MCP clients
  // wired before the rename keep working.
  const tools = [
    {
      base: 'doctor_report',
      config: {
        title: 'Tierward doctor report',
        description:
          'Runs `tierward doctor --report` against the current project and returns the JSON compliance summary (29 checks: governance files, hooks, skill spec, security variant, drift markers).',
        inputSchema: {},
      },
      handler: async () => buildToolReply(runDoctorReport(getCwd())),
    },
    {
      base: 'team_settings',
      config: {
        title: 'Tierward team-settings.json contents',
        description:
          'Returns the parsed `.claude/team-settings.json` for the current project. The `present` flag indicates whether the file exists; when absent, the project is unrestricted by Tierward governance.',
        inputSchema: {},
      },
      handler: async () => buildToolReply(readTeamSettings(getCwd())),
    },
    {
      base: 'arch_audit_status',
      config: {
        title: 'Last arch-audit run status',
        description:
          'Returns the timestamp of the last `arch-audit` skill execution recorded in `.claude/session/last-arch-audit`, plus age in days. Useful to verify the weekly cadence is honoured.',
        inputSchema: {},
      },
      handler: async () => buildToolReply(readArchAuditStatus(getCwd())),
    },
    {
      base: 'skill_inventory',
      config: {
        title: 'Installed skills inventory',
        description:
          'Lists every skill installed in `.claude/skills/`, with frontmatter snapshot (description, model, allowed-tools, user-invocable). Custom skills are flagged separately.',
        inputSchema: {},
      },
      handler: async () => buildToolReply(readSkillInventory(getCwd())),
    },
    {
      base: 'pr_review',
      config: {
        title: 'Read /pr-review skill state on a PR',
        description:
          "Reads the audit trail of `/pr-review` skill comments on a GitHub PR (verdict, severity counts, body preview). Read-only: this tool does not run a fresh review. To generate a new review, invoke the `/pr-review` Tierward skill via the CLI (the tool returns the exact invocation in `cliInvocation`). Requires the `gh` CLI to be authenticated against the project's GitHub repo.",
        inputSchema: {
          prNumber: z.number().int().positive().describe('GitHub PR number to inspect'),
        },
      },
      handler: async (args) => buildToolReply(readPrReviewState(args?.prNumber)),
    },
    {
      base: 'package_meta',
      config: {
        title: 'Tierward package metadata',
        description:
          'Returns the Tierward package name, installed version, CLI path, and resolved project root. Useful for clients to verify which Tierward CLI is wired up to this MCP server.',
        inputSchema: {},
      },
      handler: async () => buildToolReply(getPackageMeta()),
    },
  ];

  for (const { base, config, handler } of tools) {
    server.registerTool(`tierward_${base}`, config, handler);
    server.registerTool(
      `cdk_${base}`,
      {
        ...config,
        description: `[Deprecated alias for tierward_${base}] ${config.description}`,
      },
      handler,
    );
  }

  return server;
}

export async function startStdio() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Robust "run as main" detection. The naive
// `import.meta.url === file://${process.argv[1]}` breaks whenever argv[1] is a
// symlink or a path alias — e.g. the `tierward-mcp` bin symlink used by npx and
// Claude Desktop, or macOS resolving /var -> /private/var. In those cases the
// guard was false, startStdio() never ran, and the process exited immediately
// ("Server transport closed unexpectedly"). Resolve real paths on both sides.
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  startStdio().catch((err) => {
    process.stderr.write(`tierward-mcp fatal: ${err.message}\n`);
    process.exit(1);
  });
}
