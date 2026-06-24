import fs from 'fs';
import path from 'path';

const PLACEHOLDER_TOKEN_RE = /\[[A-Z][A-Z0-9_]+\]/;

export function parseActiveSkills(claudeMd) {
  const section = claudeMd.match(/^## Active Skills\s*\n([\s\S]*?)(?=\n## |\n---|\n\n##|\n$)/m);
  if (!section) return [];
  const lines = section[1].split('\n');
  const skills = [];
  for (const line of lines) {
    const m = line.match(/^-\s+`\/([a-z0-9]+(?:-[a-z0-9]+)*)`/);
    if (m) skills.push(m[1]);
  }
  return skills;
}

export function parseStopHookTestCmd(settingsJson) {
  try {
    const hook = settingsJson?.hooks?.Stop?.[0]?.hooks?.[0]?.command;
    if (!hook || typeof hook !== 'string') return null;
    // Tier M/L (v1.33.5+): test command captured in `OUT=$(<cmd> 2>&1)`.
    // Must be tried before the tierS fallback — the new hook also contains
    // `cd "$CLAUDE_PROJECT_DIR" || exit 0`, which the tierS regex would otherwise
    // mis-capture as the test command.
    const tierMl = hook.match(/OUT=\$\(\s*(.+?)\s+2>&1\s*\)/);
    if (tierMl) return tierMl[1].trim();
    // Tier M/L (legacy, pre-v1.33.5): `cd $CLAUDE_PROJECT_DIR && <cmd> 2>&1 | tail`.
    // Kept so doctor still parses projects scaffolded by older Tierward versions.
    const tierMlLegacy = hook.match(
      /&&\s*exit\s+0\s*;\s*cd\s+\$CLAUDE_PROJECT_DIR\s*&&\s*(.+?)\s+2>&1\s*\|/,
    );
    if (tierMlLegacy) return tierMlLegacy[1].trim();
    const tierS = hook.match(/&&\s*exit\s+0\s*;\s*(.+?)\s*\|\|/);
    return tierS ? tierS[1].trim() : null;
  } catch {
    return null;
  }
}

export function claudeMdContainsCommand(claudeMd, command) {
  if (!command) return false;
  const keyCommandsBlock = claudeMd.match(/^## Key Commands\s*\n([\s\S]*?)(?=\n## |\n---|\n$)/m);
  if (!keyCommandsBlock) return false;
  return keyCommandsBlock[1].includes(command);
}

export function hasPlaceholder(text) {
  return PLACEHOLDER_TOKEN_RE.test(text);
}

export function detectPipelineTier(pipelineMd) {
  const h1 = (pipelineMd.split('\n')[0] || '').trim();
  if (/^#\s+Fast Lane Pipeline\b/.test(h1)) return 's';
  if (/^#\s+Standard Development Pipeline - Tier M\b/.test(h1)) return 'm';
  if (/^#\s+Full Development Pipeline - Tier L\b/.test(h1)) return 'l';
  return 'unknown';
}

export function detectPhaseCountTier(pipelineMd) {
  if (/^##\s+FL-\d+/m.test(pipelineMd)) return 's';
  if (/^##\s+Phase\s+1\.6/m.test(pipelineMd)) return 'l';
  if (/^##\s+Phase\s+\d+/m.test(pipelineMd)) return 'm';
  return 'unknown';
}

export function detectSecurityVariant(securityMd) {
  const h1 = (securityMd.split('\n')[0] || '').trim();
  if (/^#\s+Security Rules - Native Apple\b/.test(h1)) return 'native-apple';
  if (/^#\s+Security Rules - Native Android\b/.test(h1)) return 'native-android';
  if (/^#\s+Security Rules - Systems & Backend\b/.test(h1)) return 'systems';
  if (/^#\s+Security Rules\s*$/.test(h1)) return 'web';
  const variantMarkers = [
    { re: /\bKeychain\b/, variant: 'native-apple' },
    { re: /\bAndroid Keystore\b|\bAndroidManifest\.xml\b/, variant: 'native-android' },
    { re: /\bMemory & Resource Safety\b/, variant: 'systems' },
    { re: /\brow-level access control\b|\bRLS\b/i, variant: 'web' },
  ];
  for (const { re, variant } of variantMarkers) {
    if (re.test(securityMd)) return variant;
  }
  return 'unknown';
}

export function expectedSecurityVariant(techStack, hasApi) {
  if (techStack === 'swift') return 'native-apple';
  if (techStack === 'kotlin') return 'native-android';
  const systems = ['rust', 'dotnet', 'java', 'go'];
  if (systems.includes(techStack) && hasApi === false) return 'systems';
  return 'web';
}

export function detectStackSync(cwd) {
  const exists = (f) => fs.existsSync(path.join(cwd, f));
  if (exists('Package.swift')) return 'swift';
  if (exists('build.gradle.kts') || exists('build.gradle')) return 'kotlin';
  if (exists('Cargo.toml')) return 'rust';
  if (exists('go.mod')) return 'go';
  if (exists('Gemfile')) return 'ruby';
  if (exists('pom.xml')) return 'java';
  if (exists('pyproject.toml') || exists('requirements.txt')) return 'python';
  if (fs.existsSync(cwd)) {
    try {
      const entries = fs.readdirSync(cwd);
      if (entries.some((n) => n.endsWith('.csproj'))) return 'dotnet';
    } catch {
      // ignore
    }
  }
  if (exists('tsconfig.json') || exists('package.json')) {
    return exists('tsconfig.json') ? 'node-ts' : 'node-js';
  }
  return null;
}
