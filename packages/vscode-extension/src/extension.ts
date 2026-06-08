import * as vscode from 'vscode';
import { CdkBackend, CdkBackendError } from './cdkBackend';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Claude Dev Kit');
  context.subscriptions.push(output);

  context.subscriptions.push(
    vscode.commands.registerCommand('cdk.showDoctorReport', () => runDoctorReport(output)),
  );
}

export function deactivate(): void {
  // Subscriptions are disposed by VS Code via context.subscriptions.
}

async function runDoctorReport(output: vscode.OutputChannel): Promise<void> {
  const projectRoot = resolveProjectRoot();
  if (!projectRoot) {
    void vscode.window.showWarningMessage('Claude Dev Kit: open a workspace folder first.');
    return;
  }

  const cliPath =
    vscode.workspace.getConfiguration('cdk').get<string>('cliPath') ?? 'claude-dev-kit';
  const backend = new CdkBackend({ projectRoot, cliPath });

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
