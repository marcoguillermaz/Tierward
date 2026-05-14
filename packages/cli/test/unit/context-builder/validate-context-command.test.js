import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildValidationOutput } from '../../../src/commands/validate-context.js';

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

// ── Pure builder ─────────────────────────────────────────────────────

describe('buildValidationOutput', () => {
  it('returns stdout+exit 0 for valid result (human-readable)', () => {
    const out = buildValidationOutput(
      '/tmp/CONTEXT.md',
      { valid: true, errors: [], data: { schema_version: 1 }, body: '' },
      false,
    );
    assert.equal(out.exitCode, 0);
    assert.equal(out.stream, 'stdout');
    assert.match(out.text, /is valid \(schema v1\)/);
  });

  it('returns stderr+exit 1 for invalid result (human-readable)', () => {
    const out = buildValidationOutput(
      '/tmp/bad.md',
      {
        valid: false,
        errors: [{ code: 'SCHEMA_VIOLATION', message: 'missing field', path: ['stack'] }],
        data: null,
        body: null,
      },
      false,
    );
    assert.equal(out.exitCode, 1);
    assert.equal(out.stream, 'stderr');
    assert.match(out.text, /failed validation/);
    assert.match(out.text, /\[SCHEMA_VIOLATION\] stack: missing field/);
  });

  it('returns JSON on stdout when asJson=true (valid)', () => {
    const r = { valid: true, errors: [], data: { schema_version: 1 }, body: 'body' };
    const out = buildValidationOutput('/tmp/CONTEXT.md', r, true);
    assert.equal(out.exitCode, 0);
    assert.equal(out.stream, 'stdout');
    const parsed = JSON.parse(out.text);
    assert.equal(parsed.valid, true);
  });

  it('returns JSON on stdout with exit 1 when asJson=true (invalid)', () => {
    const r = {
      valid: false,
      errors: [{ code: 'EMPTY_FILE', message: 'empty', path: [] }],
      data: null,
      body: null,
    };
    const out = buildValidationOutput('/tmp/bad.md', r, true);
    assert.equal(out.exitCode, 1);
    assert.equal(out.stream, 'stdout');
    const parsed = JSON.parse(out.text);
    assert.equal(parsed.valid, false);
  });

  it('handles error.path as empty array → (root)', () => {
    const out = buildValidationOutput(
      '/tmp/bad.md',
      {
        valid: false,
        errors: [{ code: 'NO_FRONTMATTER', message: 'no fm', path: [] }],
        data: null,
        body: null,
      },
      false,
    );
    assert.match(out.text, /\(root\)/);
  });
});

// ── Integration (CLI as subprocess) ──────────────────────────────────

describe('validate-context CLI (subprocess)', () => {
  it('exits 0 on valid CONTEXT.md', () => {
    const r = runCli(`validate-context "${path.join(FIXTURES, 'valid-greenfield.md')}"`);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /is valid/);
  });

  it('exits 1 on invalid CONTEXT.md (schema violation)', () => {
    const r = runCli(`validate-context "${path.join(FIXTURES, 'invalid-missing-required.md')}"`);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /failed validation/);
    assert.match(r.stderr, /\[SCHEMA_VIOLATION\]/);
  });

  it('exits 1 with FILE_NOT_FOUND when file missing', () => {
    const r = runCli(`validate-context /tmp/does-not-exist-99999.md`);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /FILE_NOT_FOUND/);
  });

  it('--json flag emits JSON on stdout (valid)', () => {
    const r = runCli(`validate-context "${path.join(FIXTURES, 'valid-greenfield.md')}" --json`);
    assert.equal(r.exitCode, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.valid, true);
    assert.equal(parsed.data.schema_version, 1);
  });

  it('--json flag emits JSON on stdout with exit 1 (invalid)', () => {
    const r = runCli(`validate-context "${path.join(FIXTURES, 'invalid-empty.md')}" --json`);
    assert.equal(r.exitCode, 1);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.valid, false);
    assert.equal(parsed.errors[0].code, 'EMPTY_FILE');
  });

  it('defaults to ./CONTEXT.md when no path given', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-vc-'));
    try {
      fs.copyFileSync(path.join(FIXTURES, 'valid-greenfield.md'), path.join(tmpDir, 'CONTEXT.md'));
      const r = runCli('validate-context', { cwd: tmpDir });
      assert.equal(r.exitCode, 0);
      assert.match(r.stdout, /is valid/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('--help shows command description', () => {
    const r = runCli('validate-context --help');
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /Validate a CONTEXT\.md/);
    assert.match(r.stdout, /--json/);
  });
});
