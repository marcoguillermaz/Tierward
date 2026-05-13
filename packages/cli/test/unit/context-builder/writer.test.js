import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  serializeContext,
  writeContextFile,
  DEFAULT_BODY,
} from '../../../src/context-builder/writer.js';
import {
  validateContextContent,
  validateContextFile,
} from '../../../src/utils/validate-context.js';

const validGreenfield = {
  schema_version: 1,
  generated_at: '2026-05-11T10:00:00Z',
  generated_by: 'context-builder',
  generated_by_version: '1.0.0',
  project: {
    name: 'demo',
    description: 'A test project',
    mode: 'greenfield',
  },
  stack: { primary: 'node-ts' },
  commands: {
    install: 'npm install',
    test: 'npx vitest run',
    type_check: 'npx tsc --noEmit',
    dev: 'npm run dev',
  },
  tier: { selected: 's', rationale: 'Solo dev, bugfixes' },
  scaffold_options: { include_pre_commit: true, include_github: false },
};

const validInPlace = {
  schema_version: 1,
  generated_at: '2026-05-11T10:00:00Z',
  generated_by: 'context-builder',
  generated_by_version: '1.0.0',
  project: {
    name: 'existing',
    description: 'Existing python service',
    mode: 'in-place',
  },
  stack: { primary: 'python' },
  commands: { install: 'pip install -r requirements.txt', test: 'pytest' },
  tier: { selected: 's', rationale: 'Existing maintenance' },
  scaffold_options: { include_pre_commit: true, include_github: true },
  inference: {
    source_files: ['requirements.txt', 'main.py'],
    confidence: { 'stack.primary': 'high', 'commands.test': 'medium' },
  },
};

describe('serializeContext', () => {
  it('produces a string with --- delimiters', () => {
    const out = serializeContext(validGreenfield);
    assert.ok(out.startsWith('---\n'));
    assert.match(out, /\n---\n/);
  });

  it('uses DEFAULT_BODY when body is omitted', () => {
    const out = serializeContext(validGreenfield);
    assert.ok(out.includes('## What we are building'));
    assert.ok(out.includes('## Operational constraints'));
    assert.ok(out.includes('## Open questions'));
  });

  it('uses provided body when supplied', () => {
    const body = '# Custom body\n\nProse here.';
    const out = serializeContext(validGreenfield, body);
    assert.ok(out.endsWith(body));
    assert.ok(!out.includes('## What we are building'));
  });

  it('preserves field order: schema_version first', () => {
    const out = serializeContext(validGreenfield);
    const yamlBlock = out.match(/^---\n([\s\S]*?)\n---/)[1];
    const firstLine = yamlBlock.split('\n')[0];
    assert.match(firstLine, /^schema_version:/);
  });
});

describe('round-trip property: serializeContext → validate passes', () => {
  it('greenfield: serialized output validates clean', () => {
    const out = serializeContext(validGreenfield);
    const result = validateContextContent(out);
    assert.equal(result.valid, true, `Expected valid; errors: ${JSON.stringify(result.errors)}`);
  });

  it('in-place: serialized output validates clean', () => {
    const out = serializeContext(validInPlace);
    const result = validateContextContent(out);
    assert.equal(result.valid, true, `Expected valid; errors: ${JSON.stringify(result.errors)}`);
  });

  it('default body is preserved through round-trip', () => {
    const out = serializeContext(validGreenfield);
    const result = validateContextContent(out);
    assert.equal(result.valid, true);
    assert.ok(result.body.includes('## What we are building'));
  });

  it('custom body is preserved through round-trip', () => {
    const customBody = '# Custom\n\nLine.\n';
    const out = serializeContext(validGreenfield, customBody);
    const result = validateContextContent(out);
    assert.equal(result.valid, true);
    assert.equal(result.body.trim(), customBody.trim());
  });
});

describe('writeContextFile', () => {
  it('writes file to disk and round-trip-validates', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-writer-'));
    const target = path.join(tmpDir, 'CONTEXT.md');
    try {
      writeContextFile(target, validGreenfield);
      assert.ok(fs.existsSync(target), 'file should exist');
      const result = validateContextFile(target);
      assert.equal(result.valid, true, `Expected valid; errors: ${JSON.stringify(result.errors)}`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns the same content it wrote', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-writer-'));
    const target = path.join(tmpDir, 'CONTEXT.md');
    try {
      const returned = writeContextFile(target, validGreenfield);
      const onDisk = fs.readFileSync(target, 'utf8');
      assert.equal(returned, onDisk);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('DEFAULT_BODY', () => {
  it('exports the three required section headings', () => {
    assert.ok(DEFAULT_BODY.includes('## What we are building'));
    assert.ok(DEFAULT_BODY.includes('## Operational constraints'));
    assert.ok(DEFAULT_BODY.includes('## Open questions'));
  });
});
