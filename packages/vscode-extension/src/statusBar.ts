import * as vscode from 'vscode';
import type { ArchAuditStatus, HealthSnapshot } from './cdkBackend';
import {
  ARCH_AUDIT_STALE_DAYS,
  describeArchAudit,
  evaluateHealth,
  type HealthSeverity,
} from './health';

const BACKGROUND: Record<HealthSeverity, vscode.ThemeColor | undefined> = {
  error: new vscode.ThemeColor('statusBarItem.errorBackground'),
  warning: new vscode.ThemeColor('statusBarItem.warningBackground'),
  ok: undefined,
};

/**
 * Owns a single status-bar item summarising project health: the `doctor`
 * pass/fail counts plus arch-audit staleness. Clicking it runs the doctor
 * report. Rendering is driven by a {@link HealthSnapshot} supplied by the
 * extension — the bar does not fetch, so it shares one `doctor` run with the
 * Problems-panel diagnostics.
 */
export class CdkStatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.name = 'Claude Dev Kit Health';
    this.item.command = 'cdk.showDoctorReport';
  }

  dispose(): void {
    this.item.dispose();
  }

  /** Hides the item — used when no workspace folder is open. */
  hide(): void {
    this.item.hide();
  }

  render(snapshot: HealthSnapshot): void {
    const nowUnix = Math.floor(Date.now() / 1000);
    if (!snapshot.report) {
      this.renderUnavailable(snapshot.error, snapshot.archAudit, nowUnix);
      return;
    }

    const display = evaluateHealth({
      summary: snapshot.report.summary,
      archAudit: snapshot.archAudit,
      nowUnix,
    });
    this.item.text = display.text;
    this.item.tooltip = new vscode.MarkdownString(display.tooltip);
    this.item.backgroundColor = BACKGROUND[display.severity];
    this.item.show();
  }

  private renderUnavailable(
    error: string | null,
    archAudit: ArchAuditStatus,
    nowUnix: number,
  ): void {
    this.item.text = '$(circle-slash) CDK';
    this.item.backgroundColor = undefined;
    this.item.tooltip = new vscode.MarkdownString(
      [
        '**Claude Dev Kit — health**',
        '',
        `Doctor unavailable: ${error ?? 'unknown error'}`,
        '',
        'Set `cdk.cliPath` to your claude-dev-kit CLI, or install it on PATH.',
        '',
        `Arch-audit: ${describeArchAudit(archAudit, nowUnix, ARCH_AUDIT_STALE_DAYS)}`,
      ].join('\n'),
    );
    this.item.show();
  }
}
