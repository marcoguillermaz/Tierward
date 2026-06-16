import * as vscode from 'vscode';
import { CdkBackend, CdkBackendError } from './cdkBackend';
import { GovernanceTreeProvider } from './governanceTree';
import { CdkStatusBar } from './statusBar';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Claude Dev Kit');
  context.subscriptions.push(output);

  const treeProvider = new GovernanceTreeProvider(() => createBackend());
  const statusBar = new CdkStatusBar(() => createBackend());

  // Coalesces a burst of file-watcher events (e.g. a git checkout touching
  // many `.claude/` files) into a single refresh of both surfaces.
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const refreshAll = (): void => {
    if (debounce) {
      clearTimeout(debounce);
    }
    debounce = setTimeout(() => {
      treeProvider.refresh();
      void statusBar.refresh();
    }, 300);
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
    watcher.onDidCreate(refreshAll);
    watcher.onDidChange(refreshAll);
    watcher.onDidDelete(refreshAll);
    context.subscriptions.push(watcher);
  }

  context.subscriptions.push(
    treeProvider,
    statusBar,
    vscode.window.registerTreeDataProvider('cdk.governance', treeProvider),
    vscode.commands.registerCommand('cdk.refreshGovernance', () => {
      treeProvider.refresh();
      void statusBar.refresh();
    }),
    vscode.commands.registerCommand('cdk.showDoctorReport', () => runDoctorReport(output, statusBar)),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      treeProvider.refresh();
      void statusBar.refresh();
    }),
    { dispose: () => debounce && clearTimeout(debounce) },
  );

  void statusBar.refresh();
}

export function deactivate(): void {
  // Subscriptions are disposed by VS Code via context.subscriptions.
}

function createBackend(): CdkBackend | undefined {
  const projectRoot = resolveProjectRoot();
  if (!projectRoot) {
    return undefined;
  }
  const cliPath =
    vscode.workspace.getConfiguration('cdk').get<string>('cliPath') ?? 'claude-dev-kit';
  return new CdkBackend({ projectRoot, cliPath });
}

async function runDoctorReport(output: vscode.OutputChannel, statusBar: CdkStatusBar): Promise<void> {
  const backend = createBackend();
  if (!backend) {
    void vscode.window.showWarningMessage('Claude Dev Kit: open a workspace folder first.');
    return;
  }

  try {
    const report = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'Claude Dev Kit: running doctor…' },
      () => backend.getDoctorReport(),
    );

    output.clear();
    output.appendLine(JSON.stringify(report, null, 2));
    output.show(true);

    const { passed, warned, failed, skipped } = report.summary;
    const total = passed + warned + failed + skipped;
    const message = `CDK doctor: ${passed}/${total} passed, ${failed} failed, ${warned} warnings.`;
    if (failed > 0) {
      void vscode.window.showWarningMessage(message);
    } else {
      void vscode.window.showInformationMessage(message);
    }
  } catch (error) {
    const message = error instanceof CdkBackendError ? error.message : String(error);
    void vscode.window.showErrorMessage(`Claude Dev Kit: ${message}`);
  } finally {
    // Reflect the freshly-run report (or a now-visible failure) in the bar.
    void statusBar.refresh();
  }
}

function resolveProjectRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}
