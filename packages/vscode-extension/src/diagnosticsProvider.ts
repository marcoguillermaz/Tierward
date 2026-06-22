import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { HealthSnapshot } from './tierwardBackend';
import { buildDiagnostics } from './diagnostics';

const SEVERITY: Record<'error' | 'warning', vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
};

// Candidate hub files, in order, for diagnostics whose target is missing or
// not tied to a single file (e.g. multi-skill checks).
const HUB_CANDIDATES = ['.claude/settings.json', 'CLAUDE.md', '.gitignore', 'README.md'];

/**
 * Publishes doctor failures/warnings (and a stale arch-audit) to the Problems
 * panel. Each diagnostic anchors to the file its check concerns when that file
 * exists; otherwise it falls back to a project hub file so it stays navigable.
 * Driven by the shared {@link HealthSnapshot} — it does not fetch.
 */
export class TierwardDiagnostics {
  private readonly collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('tierward');
  }

  dispose(): void {
    this.collection.dispose();
  }

  clear(): void {
    this.collection.clear();
  }

  render(root: string, snapshot: HealthSnapshot): void {
    this.collection.clear();
    // No report → the status bar already signals the degraded CLI; don't leave
    // stale check diagnostics behind.
    if (!snapshot.report) {
      return;
    }

    const nowUnix = Math.floor(Date.now() / 1000);
    const specs = buildDiagnostics(snapshot.report, snapshot.archAudit, nowUnix);
    if (specs.length === 0) {
      return;
    }

    const hub = this.resolveHub(root);
    const byUri = new Map<string, { uri: vscode.Uri; diags: vscode.Diagnostic[] }>();

    for (const spec of specs) {
      const uri = this.resolveUri(root, spec.relPath, hub);
      const diag = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 0),
        spec.message,
        SEVERITY[spec.severity],
      );
      diag.source = 'tierward';
      diag.code = spec.code;

      const key = uri.toString();
      const entry = byUri.get(key) ?? { uri, diags: [] };
      entry.diags.push(diag);
      byUri.set(key, entry);
    }

    for (const { uri, diags } of byUri.values()) {
      this.collection.set(uri, diags);
    }
  }

  private resolveHub(root: string): vscode.Uri {
    for (const rel of HUB_CANDIDATES) {
      const abs = join(root, rel);
      if (existsSync(abs)) {
        return vscode.Uri.file(abs);
      }
    }
    return vscode.Uri.file(root);
  }

  private resolveUri(root: string, relPath: string | null, hub: vscode.Uri): vscode.Uri {
    if (relPath) {
      const abs = join(root, relPath);
      if (existsSync(abs)) {
        return vscode.Uri.file(abs);
      }
    }
    return hub;
  }
}
