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
