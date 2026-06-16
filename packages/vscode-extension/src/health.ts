import type { ArchAuditStatus, DoctorSummary } from './cdkBackend';

/** Weekly cadence: arch-audit is considered stale past this many days. */
export const ARCH_AUDIT_STALE_DAYS = 7;

export type HealthSeverity = 'ok' | 'warning' | 'error';

export interface HealthDisplay {
  severity: HealthSeverity;
  /** Status-bar label; may embed `$(codicon)` tokens. */
  text: string;
  /** Markdown tooltip body. */
  tooltip: string;
}

export interface HealthInput {
  summary: DoctorSummary;
  archAudit: ArchAuditStatus;
  /** Current time as Unix epoch seconds. */
  nowUnix: number;
  staleDays?: number;
}

/** Days since the last arch-audit run, or null when it never ran / is unparseable. */
export function archAuditAgeDays(archAudit: ArchAuditStatus, nowUnix: number): number | null {
  if (!archAudit.everRan || archAudit.lastRunUnix == null) {
    return null;
  }
  return (nowUnix - archAudit.lastRunUnix) / 86400;
}

/** Human-readable arch-audit line for tooltips. */
export function describeArchAudit(
  archAudit: ArchAuditStatus,
  nowUnix: number,
  staleDays = ARCH_AUDIT_STALE_DAYS,
): string {
  if (!archAudit.everRan) {
    return 'never run';
  }
  const age = archAuditAgeDays(archAudit, nowUnix);
  if (age == null) {
    return 'recorded, but the timestamp is unparseable';
  }
  const rounded = Math.floor(age);
  const when = rounded <= 0 ? 'today' : `${rounded}d ago`;
  return age > staleDays ? `last run ${when} — stale (>${staleDays}d)` : `last run ${when}`;
}

/**
 * Derives the status-bar display from the doctor summary and arch-audit
 * staleness. Pure (no `vscode`, no clock) so it is fully unit-testable:
 * failures dominate, then warnings; a *lapsed* arch-audit cadence
 * (ran before, now stale) bumps an otherwise-healthy state to a warning,
 * while a never-run arch-audit stays informational.
 */
export function evaluateHealth({
  summary,
  archAudit,
  nowUnix,
  staleDays = ARCH_AUDIT_STALE_DAYS,
}: HealthInput): HealthDisplay {
  const { passed, warned, failed, skipped } = summary;
  const total = passed + warned + failed + skipped;

  const age = archAuditAgeDays(archAudit, nowUnix);
  const archStale = age != null && age > staleDays;

  let severity: HealthSeverity;
  let text: string;
  if (failed > 0) {
    severity = 'error';
    text = `$(error) CDK ${failed}✗`;
  } else if (warned > 0 || archStale) {
    severity = 'warning';
    text = warned > 0 ? `$(warning) CDK ${warned}⚠` : '$(warning) CDK';
  } else {
    severity = 'ok';
    text = '$(check) CDK';
  }

  const tooltip = [
    '**Claude Dev Kit — health**',
    '',
    `Doctor: ${passed}/${total} passed · ${failed} failed · ${warned} warnings · ${skipped} skipped`,
    '',
    `Arch-audit: ${describeArchAudit(archAudit, nowUnix, staleDays)}`,
    '',
    'Click to run the doctor report.',
  ].join('\n');

  return { severity, text, tooltip };
}
