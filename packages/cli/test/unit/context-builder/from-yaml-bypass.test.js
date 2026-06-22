import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeFromYamlSource, runFromYamlBypass } from '../../../src/commands/context.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '../../../src/index.js');
const FIXTURES = path.resolve(__dirname, '../../fixtures/context-builder');

function runCli(args, opts = {}) {
  try {
    const stdout = execSync(`node "${CLI}" ${args}`, {
      stdio: 'pipe',
      cwd: opts.cwd,
      encoding: 'utf8',
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (e) {
    return {
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

const VALID_YAML_ONLY = `schema_version: 1
generated_at: '2026-05-14T10:00:00Z'
generated_by: hand-edited
generated_by_version: 1.0.0
project:
  name: from-yaml-test
  description: A project loaded from raw YAML.
  mode: greenfield
stack:
  primary: node-ts
commands:
  install: npm install
  test: npx vitest run
tier:
  selected: s
  rationale: Solo dev, bugfix scope
scaffold_options:
  include_pre_commit: true
  include_github: false
`;

describe('normalizeFromYamlSource', () => {
  it('passes through markdown with frontmatter unchanged', () => {
    const md = `---\nfoo: bar\n---\n\nbody`;
    assert.equal(normalizeFromYamlSource(md), md);
  });

  it('wraps raw YAML with --- delimiters + DEFAULT_BODY', () => {
    const yaml = 'schema_version: 1\nproject:\n  name: x';
    const wrapped = normalizeFromYamlSource(yaml);
    assert.ok(wrapped.startsWith('---\n'));
    assert.match(wrapped, /\n---\n/);
    assert.match(wrapped, /## What we are building/);
  });

  it('trims trailing newlines on raw YAML before wrapping', () => {
    const yaml = 'foo: bar\n\n\n';
    const wrapped = normalizeFromYamlSource(yaml);
    assert.ok(wrapped.startsWith('---\nfoo: bar\n---\n'));
  });
});

describe('runFromYamlBypass — programmatic', () => {
  it('writes CONTEXT.md from a valid raw YAML file', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierward-fy-'));
    const src = path.join(tmpDir, 'config.yaml');
    fs.writeFileSync(src, VALID_YAML_ONLY);
    try {
      const out = await runFromYamlBypass({
        sourcePath: src,
        cwd: tmpDir,
        silent: true,
        throwOnInvalid: true,
      });
      assert.ok(fs.existsSync(out.path));
      assert.equal(out.data.project.name, 'from-yaml-test');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('writes CONTEXT.md from a full markdown file with frontmatter+body', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierward-fy-'));
    const src = path.join(FIXTURES, 'valid-greenfield.md');
    try {
      const out = await runFromYamlBypass({
        sourcePath: src,
        cwd: tmpDir,
        silent: true,
        throwOnInvalid: true,
      });
      assert.ok(fs.existsSync(out.path));
      assert.equal(out.data.project.mode, 'greenfield');
      // body preserved from source
      assert.ok(out.body.length > 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('throws FROM_YAML_SOURCE_MISSING when file does not exist', async () => {
    await assert.rejects(
      runFromYamlBypass({
        sourcePath: '/tmp/tierward-does-not-exist-99999.yaml',
        cwd: os.tmpdir(),
        silent: true,
        throwOnInvalid: true,
      }),
      (e) => e.code === 'FROM_YAML_SOURCE_MISSING',
    );
  });

  it('throws INVALID_CONTEXT when YAML fails schema', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierward-fy-'));
    const src = path.join(tmpDir, 'bad.yaml');
    fs.writeFileSync(src, 'schema_version: 1\nproject:\n  name: incomplete\n');
    try {
      await assert.rejects(
        runFromYamlBypass({
          sourcePath: src,
          cwd: tmpDir,
          silent: true,
          throwOnInvalid: true,
        }),
        (e) => e.code === 'INVALID_CONTEXT',
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('context --from-yaml (CLI)', () => {
  it('exits 0 and writes CONTEXT.md from raw YAML', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierward-fy-cli-'));
    const src = path.join(tmpDir, 'config.yaml');
    fs.writeFileSync(src, VALID_YAML_ONLY);
    try {
      const r = runCli(`context --from-yaml "${src}"`, { cwd: tmpDir });
      assert.equal(r.exitCode, 0);
      assert.match(r.stdout, /Schema validation passed/);
      assert.ok(fs.existsSync(path.join(tmpDir, 'CONTEXT.md')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits 1 with error message when source is invalid', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierward-fy-cli-'));
    const src = path.join(tmpDir, 'bad.yaml');
    fs.writeFileSync(src, 'schema_version: 1\nproject:\n  name: incomplete\n');
    try {
      const r = runCli(`context --from-yaml "${src}"`, { cwd: tmpDir });
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /failed validation/);
      // CONTEXT.md must NOT be written on validation failure
      assert.ok(!fs.existsSync(path.join(tmpDir, 'CONTEXT.md')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits 1 when source file missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierward-fy-cli-'));
    try {
      const r = runCli(`context --from-yaml /tmp/tierward-missing-99999.yaml`, { cwd: tmpDir });
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /not found/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('--help shows --from-yaml option', () => {
    const r = runCli('context --help');
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /--from-yaml/);
  });
});
