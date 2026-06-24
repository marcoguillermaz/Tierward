#!/usr/bin/env node
// Published-package smoke test (§7 Layer 1).
//
// Packs the CLI with `npm pack`, installs the TARBALL into a clean directory,
// and drives the INSTALLED bins — never the source tree. This is the only test
// that exercises the package the way a real `npx tierward` user does.
//
// Catches:
//   - `files` allowlist gaps (a template left out of the published tarball),
//   - ESM / packaging breakage (the installed CLI won't even run),
//   - the bin-symlink resolution class — the v1.33.3 MCP bug, where argv[1]
//     being a `.bin` symlink made the server's isMain guard false and the
//     stdio server never started. We launch the MCP server via its `.bin`
//     SYMLINK (not a resolved path) so a regression of that class goes red.
//
// Out of scope (do NOT add here): the interactive wizard. `init --answers`
// short-circuits the inquirer prompts (see init-greenfield.js), so the
// list→select class of crash (v1.33.4) is NOT exercised. That belongs to the
// static prompt-types.test.js guard and the Layer-3 PTY test.
//
// Run: npm run test:smoke   (slow: npm pack + npm install of real deps)

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_DIR = path.resolve(__dirname, '../..'); // packages/cli
const FIXTURE_PATH = path.resolve(
  CLI_DIR,
  'test/fixtures/wizard-answers/greenfield-tier-s-node.json',
);

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

let passed = 0;
const failures = [];
function pass(label) {
  passed++;
  console.log(`  ${c.green('✓')} ${label}`);
}
function fail(label, detail = '') {
  failures.push(detail ? `${label} — ${detail}` : label);
  console.log(`  ${c.red('✗')} ${label}${detail ? c.dim(` — ${detail}`) : ''}`);
}
function assert(cond, label, detail = '') {
  if (cond) pass(label);
  else fail(label, detail);
}

// Run a command, capturing stdout/stderr/exit without throwing.
function run(cmd, args, opts = {}) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      code: err.status ?? 1,
      stdout: (err.stdout || '').toString(),
      stderr: (err.stderr || '').toString(),
    };
  }
}

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-smoke-'));
  console.log(`\nPublished-package smoke — workspace ${c.dim(work)}\n`);

  try {
    // 1. Pack the CLI into a tarball (honors the `files` allowlist).
    console.log('· npm pack');
    const packed = run('npm', ['pack', '--json', `--pack-destination=${work}`], { cwd: CLI_DIR });
    if (packed.code !== 0) {
      fail('npm pack', packed.stderr.trim().split('\n').pop());
      return;
    }
    let tarball;
    try {
      tarball = path.join(work, JSON.parse(packed.stdout)[0].filename);
    } catch {
      fail('npm pack', 'could not parse --json output');
      return;
    }
    assert(fs.existsSync(tarball), `tarball produced (${path.basename(tarball)})`);

    // 2. Install the tarball into a clean consumer dir (creates .bin symlinks + deps).
    console.log('· npm install <tarball> in a clean dir');
    const consumer = path.join(work, 'consumer');
    fs.mkdirSync(consumer);
    fs.writeFileSync(
      path.join(consumer, 'package.json'),
      JSON.stringify({ name: 'smoke-consumer', version: '0.0.0', private: true }, null, 2),
    );
    const install = run('npm', ['install', tarball, '--no-audit', '--no-fund'], { cwd: consumer });
    if (install.code !== 0) {
      fail('npm install tarball', install.stderr.trim().split('\n').pop());
      return;
    }
    pass('npm install tarball succeeds');

    const binDir = path.join(consumer, 'node_modules', '.bin');
    const binTierward = path.join(binDir, 'tierward');
    const binMcp = path.join(binDir, 'tierward-mcp');
    assert(fs.existsSync(binTierward), 'bin: tierward present');
    // The bin must be a SYMLINK — that is the exact condition the MCP isMain
    // guard regressed on. If npm's layout ever stops symlinking, fail loudly.
    assert(
      fs.existsSync(binMcp) && fs.lstatSync(binMcp).isSymbolicLink(),
      'bin: tierward-mcp present and is a symlink',
    );

    // 3. Scaffold a Tier S project using the INSTALLED bin (not the source).
    console.log('· installed `tierward init` (Tier S, node-ts)');
    const scaffold = path.join(work, 'scaffold');
    fs.mkdirSync(scaffold);
    const answers = fs.readFileSync(FIXTURE_PATH, 'utf8');
    const init = run(binTierward, ['init', '--answers', answers], { cwd: scaffold });
    assert(init.code === 0, 'init exits 0', init.stderr.trim().split('\n').pop());

    const settingsPath = path.join(scaffold, '.claude', 'settings.json');
    assert(fs.existsSync(settingsPath), 'scaffold: .claude/settings.json exists');
    assert(fs.existsSync(path.join(scaffold, 'CLAUDE.md')), 'scaffold: CLAUDE.md exists');
    if (fs.existsSync(settingsPath)) {
      const settings = fs.readFileSync(settingsPath, 'utf8');
      assert(
        !/\[[A-Z][A-Z0-9_]+\]/.test(settings),
        'scaffold: no unfilled placeholder in settings.json',
      );
    }

    // 4. Doctor must report a clean fresh scaffold (0 fails; warns tolerated).
    console.log('· installed `tierward doctor --report`');
    const doctor = run(binTierward, ['doctor', '--report'], { cwd: scaffold });
    try {
      const report = JSON.parse(doctor.stdout);
      const checks = report.checks || [];
      const fails = checks.filter((ch) => ch.pass === false && !ch.warn && !ch.skip);
      assert(
        fails.length === 0,
        'doctor: 0 fails on fresh scaffold',
        fails.map((ch) => ch.id || ch.label).join(', '),
      );
    } catch {
      fail('doctor: --report is parseable JSON', doctor.stderr.trim().split('\n').pop());
    }

    // 5. Context builder → deterministic init (P1a).
    //
    // `npx tierward context` generates CONTEXT.md via LLM interview — not smoke-testable
    // in isolation. The testable path: (a) `tierward context --from-yaml` writes a
    // schema-valid CONTEXT.md from a minimal YAML input without LLM calls, then (b)
    // `tierward init` detects it and scaffolds without prompts. This path was absent
    // from all automated tests despite being documented since v1.27.0 (README "Context
    // Builder" section). Using `--from-yaml` means no ANTHROPIC_API_KEY required.
    console.log('· context builder: context --from-yaml → CONTEXT.md → init deterministic');
    const ctxScaffold = path.join(work, 'ctx-scaffold');
    fs.mkdirSync(ctxScaffold);
    // Minimal schema-valid YAML for --from-yaml (schema v1 requires these exact fields).
    const ctxYaml = [
      'schema_version: 1',
      `generated_at: "${new Date().toISOString()}"`,
      'generated_by: smoke-test',
      'generated_by_version: "1.33.4"',
      'project:',
      '  name: Context Smoke Project',
      '  description: Smoke test for context builder path',
      '  mode: greenfield',
      'stack:',
      '  primary: node-ts',
      'commands:',
      '  install: npm install',
      '  test: npx vitest run',
      'tier:',
      '  selected: "s"',
      '  rationale: Solo project, fast lane',
      'scaffold_options:',
      '  include_pre_commit: false',
      '  include_github: false',
    ].join('\n');
    const ctxYamlPath = path.join(work, 'ctx-input.yaml');
    fs.writeFileSync(ctxYamlPath, ctxYaml);
    const ctxGen = run(binTierward, ['context', '--from-yaml', ctxYamlPath], { cwd: ctxScaffold });
    assert(
      ctxGen.code === 0,
      'context builder: context --from-yaml exits 0',
      ctxGen.stderr.trim().split('\n').pop(),
    );
    assert(
      fs.existsSync(path.join(ctxScaffold, 'CONTEXT.md')),
      'context builder: CONTEXT.md written',
    );
    const ctxInit = run(binTierward, ['init'], { cwd: ctxScaffold });
    assert(
      ctxInit.code === 0,
      'context builder: init from CONTEXT.md exits 0',
      ctxInit.stderr.trim().split('\n').pop(),
    );
    assert(
      fs.existsSync(path.join(ctxScaffold, 'CLAUDE.md')),
      'context builder: CLAUDE.md scaffolded from CONTEXT.md',
    );
    assert(
      fs.existsSync(path.join(ctxScaffold, '.claude', 'settings.json')),
      'context builder: .claude/settings.json scaffolded from CONTEXT.md',
    );

    // 6. MCP server: launch via the .bin SYMLINK and complete an MCP handshake.
    //    This is the assertion that would have gone red on the v1.33.3 bug.
    console.log('· installed `tierward-mcp` via .bin symlink (MCP handshake)');
    try {
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
      const transport = new StdioClientTransport({
        command: binMcp,
        args: [],
        env: { ...process.env, TIERWARD_PROJECT_ROOT: scaffold },
        stderr: 'pipe',
      });
      const client = new Client({ name: 'tierward-smoke', version: '0.0.0' }, { capabilities: {} });
      await client.connect(transport);
      pass('mcp: stdio connect via .bin symlink succeeds');
      const tools = (await client.listTools()).tools.map((t) => t.name);
      const required = [
        'tierward_doctor_report',
        'tierward_team_settings',
        'tierward_arch_audit_status',
        'tierward_skill_inventory',
        'tierward_package_meta',
        'tierward_pr_review',
      ];
      const missing = required.filter((t) => !tools.includes(t));
      assert(
        missing.length === 0,
        `mcp: 6 tierward_* tools exposed`,
        `missing: ${missing.join(', ')}`,
      );
      await client.close();
    } catch (err) {
      fail('mcp: server starts and responds via .bin symlink', err.message);
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }

  console.log('');
  if (failures.length === 0) {
    console.log(c.green(`✓ published-package smoke passed (${passed} checks)`));
    process.exit(0);
  } else {
    console.log(c.red(`✗ ${failures.length} smoke check(s) failed:`));
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(c.red(`smoke harness crashed: ${err.stack || err.message}`));
  process.exit(1);
});
