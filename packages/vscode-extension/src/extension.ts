import * as vscode from 'vscode';
import { CdkBackend, CdkBackendError } from './cdkBackend';
import { GovernanceTreeProvider } from './governanceTree';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Claude Dev Kit');
  context.subscriptions.push(output);

  const treeProvider = new GovernanceTreeProvider(() => createBackend());
  context.subscriptions.push(
    treeProvider,
    vscode.window.registerTreeDataProvider('cdk.governance', treeProvider),
    vscode.commands.registerCommand('cdk.refreshGovernance', () => treeProvider.refresh()),
    vscode.commands.registerCommand('cdk.showDoctorReport', () => runDoctorReport(output)),
  );

  // Keep the tree in sync when skills or rules change on disk.
  const watcher = vscode.workspace.createFileSystemWatcher('**/.claude/{skills,rules}/**');
  watcher.onDidCreate(() => treeProvider.refresh());
  watcher.onDidChange(() => treeProvider.refresh());
  watcher.onDidDelete(() => treeProvider.refresh());
  context.subscriptions.push(watcher);
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

async function runDoctorReport(output: vscode.OutputChannel): Promise<void> {
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
  }
}

function resolveProjectRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}
