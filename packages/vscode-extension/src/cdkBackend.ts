import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

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

export interface SkillInfo {
  name: string;
  isCustom: boolean;
  description: string | null;
  model: string | null;
  userInvocable: boolean | null;
  /** Absolute path to the skill's SKILL.md. */
  path: string;
}

export interface RuleInfo {
  name: string;
  /** First Markdown heading, used as a human-readable label. */
  title: string | null;
  /** Absolute path to the rule file. */
  path: string;
}

export interface ArchAuditStatus {
  /** False when the `.claude/session/last-arch-audit` record is absent. */
  everRan: boolean;
  /** Unix epoch seconds of the last run, or null when absent/unparseable. */
  lastRunUnix: number | null;
  /** ISO timestamp of the last run, or null. */
  lastRunIso: string | null;
}

/**
 * One combined fetch of everything the health surfaces need, so the status bar
 * and the Problems-panel diagnostics render from a single `doctor` invocation
 * instead of each shelling out on their own. `report` is null when `doctor`
 * could not run (CLI unresolved), in which case `error` carries the reason.
 */
export interface HealthSnapshot {
  archAudit: ArchAuditStatus;
  report: DoctorReport | null;
  error: string | null;
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

  /**
   * Lists the skills installed under `.claude/skills/`, reading each
   * `SKILL.md` frontmatter directly from disk. Directories without a
   * `SKILL.md` are skipped. Sorted by name.
   */
  async getSkillInventory(): Promise<SkillInfo[]> {
    const skillsDir = join(this.projectRoot, '.claude', 'skills');
    if (!existsSync(skillsDir)) {
      return [];
    }

    const entries = await readdir(skillsDir, { withFileTypes: true });
    const skills: SkillInfo[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const skillFile = join(skillsDir, entry.name, 'SKILL.md');
      if (!existsSync(skillFile)) {
        continue;
      }
      const frontmatter = parseFrontmatter(await readFile(skillFile, 'utf8'));
      const userInvocable = frontmatter['user-invocable'];
      skills.push({
        name: entry.name,
        isCustom: entry.name.startsWith('custom-'),
        description: frontmatter.description ?? null,
        model: frontmatter.model ?? null,
        userInvocable: userInvocable != null ? userInvocable === 'true' : null,
        path: skillFile,
      });
    }
    return skills.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Lists the rule files under `.claude/rules/`, using each file's first
   * Markdown heading as a label. Sorted by name.
   */
  async getRules(): Promise<RuleInfo[]> {
    const rulesDir = join(this.projectRoot, '.claude', 'rules');
    if (!existsSync(rulesDir)) {
      return [];
    }

    const entries = await readdir(rulesDir, { withFileTypes: true });
    const rules: RuleInfo[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue;
      }
      const filePath = join(rulesDir, entry.name);
      rules.push({
        name: entry.name.replace(/\.md$/, ''),
        title: firstHeading(await readFile(filePath, 'utf8')),
        path: filePath,
      });
    }
    return rules.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Reads the timestamp of the last `arch-audit` skill run from
   * `.claude/session/last-arch-audit` (a Unix epoch in seconds), mirroring the
   * CDK MCP server's parser. Never throws — a missing or unreadable record
   * reports `everRan: false` so the status bar can degrade gracefully.
   */
  async getArchAuditStatus(): Promise<ArchAuditStatus> {
    const file = join(this.projectRoot, '.claude', 'session', 'last-arch-audit');
    if (!existsSync(file)) {
      return { everRan: false, lastRunUnix: null, lastRunIso: null };
    }
    try {
      const raw = (await readFile(file, 'utf8')).trim();
      const epoch = Number.parseInt(raw, 10);
      if (!Number.isFinite(epoch)) {
        return { everRan: true, lastRunUnix: null, lastRunIso: null };
      }
      return {
        everRan: true,
        lastRunUnix: epoch,
        lastRunIso: new Date(epoch * 1000).toISOString(),
      };
    } catch {
      return { everRan: false, lastRunUnix: null, lastRunIso: null };
    }
  }

  /**
   * Fetches the arch-audit status and the doctor report in one shot for the
   * health surfaces. `doctor` failures are captured (not thrown) so a missing
   * CLI degrades gracefully: `report` is null and `error` holds the reason.
   */
  async getHealthSnapshot(): Promise<HealthSnapshot> {
    const archAudit = await this.getArchAuditStatus();
    try {
      const report = await this.getDoctorReport();
      return { archAudit, report, error: null };
    } catch (error) {
      const message = error instanceof CdkBackendError ? error.message : String(error);
      return { archAudit, report: null, error: message };
    }
  }
}

/** Minimal `key: value` frontmatter reader — matches the CDK MCP server's parser. */
function parseFrontmatter(raw: string): Record<string, string> {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter: Record<string, string> = {};
  if (!match) {
    return frontmatter;
  }
  for (const line of match[1].split('\n')) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (pair) {
      frontmatter[pair[1]] = pair[2].trim();
    }
  }
  return frontmatter;
}

function firstHeading(raw: string): string | null {
  for (const line of raw.split('\n')) {
    const heading = line.match(/^#\s+(.+)$/);
    if (heading) {
      return heading[1].trim();
    }
  }
  return null;
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
