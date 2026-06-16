import type { ArchAuditStatus, DoctorReport } from './cdkBackend';
import { ARCH_AUDIT_STALE_DAYS, archAuditAgeDays, describeArchAudit } from './health';

/**
 * Maps a doctor check id to the workspace-relative file it concerns, mirroring
 * the targets in the CLI's `doctor.js`. Checks that span multiple files or no
 * file (e.g. `claude-cli`, the multi-skill `skill-*` checks, `anthropic-files-
 * current`) are intentionally absent — they resolve to the project hub instead.
 *
 * When `doctor` gains a check, an unmapped id degrades to the hub anchor (it
 * still surfaces, just less precisely) rather than disappearing.
 */
export const CHECK_FILE_MAP: Record<string, string> = {
  'claude-md': 'CLAUDE.md',
  'claude-md-size': 'CLAUDE.md',
  'no-secrets-claude-md': 'CLAUDE.md',
  'claudemd-stop-hook-test-cmd-match': 'CLAUDE.md',
  'claudemd-skills-directory-parity': 'CLAUDE.md',
  'settings-json': '.claude/settings.json',
  'stop-hook': '.claude/settings.json',
  'stop-hook-placeholder': '.claude/settings.json',
  'stop-hook-timeout': '.claude/settings.json',
  'settings-no-placeholders': '.claude/settings.json',
  'permissions-no-duplicates': '.claude/settings.json',
  'team-settings-runtime-hook': '.claude/settings.json',
  'pipeline-md': '.claude/rules/pipeline.md',
  'pipeline-md-tier-coherence': '.claude/rules/pipeline.md',
  'security-rules': '.claude/rules/security.md',
  'security-md-stack-alignment': '.claude/rules/security.md',
  'output-style-rule': '.claude/rules/output-style.md',
  'context-review-c12': '.claude/rules/context-review.md',
  'gitignore-env': '.gitignore',
  codeowners: '.github/CODEOWNERS',
  'claudemd-standards-rule': 'docs/claudemd-standards.md',
  'pipeline-standards-rule': 'docs/pipeline-standards.md',
  'commit-skill': '.claude/skills/commit/SKILL.md',
  'team-settings-compliance': '.claude/team-settings.json',
};

export type DiagnosticSeverity = 'error' | 'warning';

export interface DiagnosticSpec {
  /** Workspace-relative file the diagnostic concerns, or null → project hub. */
  relPath: string | null;
  severity: DiagnosticSeverity;
  message: string;
  /** Stable identifier (the doctor check id, or `arch-audit-stale`). */
  code: string;
}

/**
 * Turns a doctor report (plus arch-audit staleness) into diagnostic specs.
 * Pure: no `vscode`, no filesystem, no clock — URI resolution and existence
 * fallback happen in the renderer. Only `fail`/`warn` checks produce specs;
 * `pass`/`skip` are dropped. A lapsed arch-audit cadence adds one warning.
 */
export function buildDiagnostics(
  report: DoctorReport,
  archAudit: ArchAuditStatus,
  nowUnix: number,
  staleDays = ARCH_AUDIT_STALE_DAYS,
): DiagnosticSpec[] {
  const specs: DiagnosticSpec[] = [];

  for (const check of report.checks) {
    if (check.status !== 'fail' && check.status !== 'warn') {
      continue;
    }
    const detail = check.fix ? ` — ${check.fix}` : '';
    specs.push({
      relPath: CHECK_FILE_MAP[check.id] ?? null,
      severity: check.status === 'fail' ? 'error' : 'warning',
      message: `${check.label}${detail}`,
      code: check.id,
    });
  }

  const age = archAuditAgeDays(archAudit, nowUnix);
  if (age != null && age > staleDays) {
    specs.push({
      relPath: '.claude/session/last-arch-audit',
      severity: 'warning',
      message: `arch-audit ${describeArchAudit(archAudit, nowUnix, staleDays)} — re-run the arch-audit skill.`,
      code: 'arch-audit-stale',
    });
  }

  return specs;
}
