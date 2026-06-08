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
