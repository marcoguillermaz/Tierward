import * as vscode from 'vscode';
import { CdkBackend } from './cdkBackend';
import { GovernanceTreeProvider } from './governanceTree';
import { CdkStatusBar } from './statusBar';
import { CdkDiagnostics } from './diagnosticsProvider';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Claude Dev Kit');
  context.subscriptions.push(output);

  const treeProvider = new GovernanceTreeProvider(() => resolveBackend());
  const statusBar = new CdkStatusBar();
  const diagnostics = new CdkDiagnostics();

  // Refreshes every surface from a single doctor invocation: the tree reads
  // skills/rules from disk, while the status bar and Problems-panel diagnostics
  // share one `HealthSnapshot` instead of each shelling out to the CLI.
  const refreshSurfaces = async (): Promise<void> => {
    treeProvider.refresh();
    const root = resolveProjectRoot();
    const backend = resolveBackend();
    if (!root || !backend) {
      statusBar.hide();
      diagnostics.clear();
      return;
    }
    const snapshot = await backend.getHealthSnapshot();
    statusBar.render(snapshot);
    diagnostics.render(root, snapshot);
  };

  // Coalesces a burst of file-watcher events (e.g. a git checkout touching many
  // `.claude/` files) into a single refresh.
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const scheduleRefresh = (): void => {
    if (debounce) {
      clearTimeout(debounce);
    }
    debounce = setTimeout(() => void refreshSurfaces(), 300);
  };

  // Watch only the inputs the tree and doctor actually consume. Deliberately
  // NOT the whole `.claude/**` tree: `doctor` is read-only so there is no
  // self-trigger loop, but `.claude/session/` churns constantly during active
  // Claude Code use and would respawn `doctor` on every session write — so the
  // arch-audit stamp is the only session file watched.
  for (const glob of [
    '**/.claude/skills/**',
    '**/.claude/rules/**',
    '**/.claude/settings.json',
    '**/.claude/session/last-arch-audit',
    '**/CLAUDE.md',
  ]) {
    const watcher = vscode.workspace.createFileSystemWatcher(glob);
    watcher.onDidCreate(scheduleRefresh);
    watcher.onDidChange(scheduleRefresh);
    watcher.onDidDelete(scheduleRefresh);
    context.subscriptions.push(watcher);
  }

  context.subscriptions.push(
    treeProvider,
    statusBar,
    diagnostics,
    vscode.window.registerTreeDataProvider('cdk.governance', treeProvider),
    vscode.commands.registerCommand('cdk.refreshGovernance', () => void refreshSurfaces()),
    vscode.commands.registerCommand('cdk.showDoctorReport', () =>
      runDoctorReport(output, statusBar, diagnostics),
    ),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void refreshSurfaces()),
    { dispose: () => debounce && clearTimeout(debounce) },
  );

  void refreshSurfaces();
}

export function deactivate(): void {
  // Subscriptions are disposed by VS Code via context.subscriptions.
}

function resolveBackend(): CdkBackend | undefined {
  const root = resolveProjectRoot();
  if (!root) {
    return undefined;
  }
  const cliPath =
    vscode.workspace.getConfiguration('cdk').get<string>('cliPath') ?? 'claude-dev-kit';
  return new CdkBackend({ projectRoot: root, cliPath });
}

async function runDoctorReport(
  output: vscode.OutputChannel,
  statusBar: CdkStatusBar,
  diagnostics: CdkDiagnostics,
): Promise<void> {
  const root = resolveProjectRoot();
  const backend = resolveBackend();
  if (!root || !backend) {
    void vscode.window.showWarningMessage('Claude Dev Kit: open a workspace folder first.');
    return;
  }

  const snapshot = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: 'Claude Dev Kit: running doctor…' },
    () => backend.getHealthSnapshot(),
  );

  // The click reflects the freshly-run report on every surface.
  statusBar.render(snapshot);
  diagnostics.render(root, snapshot);

  if (!snapshot.report) {
    void vscode.window.showErrorMessage(`Claude Dev Kit: ${snapshot.error ?? 'doctor failed.'}`);
    return;
  }

  output.clear();
  output.appendLine(JSON.stringify(snapshot.report, null, 2));
  output.show(true);

  const { passed, warned, failed, skipped } = snapshot.report.summary;
  const total = passed + warned + failed + skipped;
  const message = `CDK doctor: ${passed}/${total} passed, ${failed} failed, ${warned} warnings.`;
  if (failed > 0) {
    void vscode.window.showWarningMessage(message);
  } else {
    void vscode.window.showInformationMessage(message);
  }
}

function resolveProjectRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}
