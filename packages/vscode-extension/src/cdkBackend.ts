import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type DoctorStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface DoctorCheck {
  id: string;
  label: string;
  status: DoctorStatus;
  info?: string | null;
  fix?: string;
}

export interface DoctorSummary {
  passed: number;
  warned: number;
  failed: number;
  skipped: number;
}

export interface DoctorReport {
  timestamp: string;
  cwd: string;
  summary: DoctorSummary;
  checks: DoctorCheck[];
}

export interface ExecResult {
  stdout: string;
  stderr: string;
}

/** Injectable command runner — the default shells out, tests pass a fake. */
export type ExecFn = (command: string, args: string[], cwd: string) => Promise<ExecResult>;

export class CdkBackendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CdkBackendError';
  }
}

const defaultExec: ExecFn = async (command, args, cwd) => {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd,
    maxBuffer: 16 * 1024 * 1024,
  });
  return { stdout, stderr };
};

export interface CdkBackendOptions {
  projectRoot: string;
  cliPath?: string;
  exec?: ExecFn;
}

/**
 * Sources CDK governance data for the extension by shelling out to the
 * installed `claude-dev-kit` CLI. Holds no `vscode` dependency so it can be
 * unit-tested under `node --test`.
 */
export class CdkBackend {
  private readonly projectRoot: string;
  private readonly cliPath: string;
  private readonly exec: ExecFn;

  constructor(options: CdkBackendOptions) {
    this.projectRoot = options.projectRoot;
    this.cliPath =
      options.cliPath && options.cliPath.trim() ? options.cliPath.trim() : 'claude-dev-kit';
    this.exec = options.exec ?? defaultExec;
  }

  /**
   * Runs `claude-dev-kit doctor --report` and returns the parsed JSON.
   *
   * `doctor` exits 1 when checks fail but still prints the report to stdout,
   * so a non-zero exit is recovered as long as stdout carries JSON.
   */
  async getDoctorReport(): Promise<DoctorReport> {
    let stdout: string;
    try {
      ({ stdout } = await this.exec(this.cliPath, ['doctor', '--report'], this.projectRoot));
    } catch (error) {
      const recovered = extractStdout(error);
      if (recovered && recovered.trim().startsWith('{')) {
        stdout = recovered;
      } else {
        throw new CdkBackendError(
          `Failed to run "${this.cliPath} doctor --report": ${describeError(error)}`,
        );
      }
    }

    try {
      return JSON.parse(stdout) as DoctorReport;
    } catch {
      throw new CdkBackendError('doctor --report did not return valid JSON.');
    }
  }
}

function extractStdout(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'stdout' in error) {
    const value = (error as { stdout?: unknown }).stdout;
    if (typeof value === 'string') {
      return value;
    }
    if (value != null) {
      return String(value);
    }
  }
  return undefined;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
