import * as vscode from 'vscode';
import { CdkBackend, CdkBackendError, type ArchAuditStatus } from './cdkBackend';
import { ARCH_AUDIT_STALE_DAYS, describeArchAudit, evaluateHealth, type HealthSeverity } from './health';

const BACKGROUND: Record<HealthSeverity, vscode.ThemeColor | undefined> = {
  error: new vscode.ThemeColor('statusBarItem.errorBackground'),
  warning: new vscode.ThemeColor('statusBarItem.warningBackground'),
  ok: undefined,
};

/**
 * Owns a single status-bar item summarising project health: the `doctor`
 * pass/fail counts plus arch-audit staleness. Clicking it runs the doctor
 * report. Backend access is deferred through a factory so the item reflects
 * the current workspace folder and `cdk.cliPath` setting on every refresh.
 */
export class CdkStatusBar {
  private readonly item: vscode.StatusBarItem;
  private refreshing = false;
  private pending = false;

  constructor(private readonly resolveBackend: () => CdkBackend | undefined) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.name = 'Claude Dev Kit Health';
    this.item.command = 'cdk.showDoctorReport';
  }

  dispose(): void {
    this.item.dispose();
  }

  /**
   * Re-evaluates and re-renders the item. Guards against overlapping runs:
   * a refresh requested while one is in flight is coalesced into a single
   * trailing run, so a burst of file-watcher events triggers `doctor` once.
   */
  async refresh(): Promise<void> {
    if (this.refreshing) {
      this.pending = true;
      return;
    }
    this.refreshing = true;
    try {
      await this.render();
    } finally {
      this.refreshing = false;
      if (this.pending) {
        this.pending = false;
        void this.refresh();
      }
    }
  }

  private async render(): Promise<void> {
    const backend = this.resolveBackend();
    if (!backend) {
      this.item.hide();
      return;
    }

    const nowUnix = Math.floor(Date.now() / 1000);
    const archAudit = await backend.getArchAuditStatus();

    let summary;
    try {
      ({ summary } = await backend.getDoctorReport());
    } catch (error) {
      this.renderUnavailable(error, archAudit, nowUnix);
      return;
    }

    const display = evaluateHealth({ summary, archAudit, nowUnix });
    this.item.text = display.text;
    this.item.tooltip = new vscode.MarkdownString(display.tooltip);
    this.item.backgroundColor = BACKGROUND[display.severity];
    this.item.show();
  }

  private renderUnavailable(error: unknown, archAudit: ArchAuditStatus, nowUnix: number): void {
    const message = error instanceof CdkBackendError ? error.message : String(error);
    this.item.text = '$(circle-slash) CDK';
    this.item.backgroundColor = undefined;
    this.item.tooltip = new vscode.MarkdownString(
      [
        '**Claude Dev Kit — health**',
        '',
        `Doctor unavailable: ${message}`,
        '',
        'Set `cdk.cliPath` to your claude-dev-kit CLI, or install it on PATH.',
        '',
        `Arch-audit: ${describeArchAudit(archAudit, nowUnix, ARCH_AUDIT_STALE_DAYS)}`,
      ].join('\n'),
    );
    this.item.show();
  }
}
