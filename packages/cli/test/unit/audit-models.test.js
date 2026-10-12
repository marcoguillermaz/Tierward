import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIT_MODELS, DEFAULT_AUDIT_MODEL, auditModelAlias } from '../../src/utils/constants.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

describe('audit model choices', () => {
  it('offers the current Sonnet, Opus and Fable models', () => {
    assert.deepEqual(
      AUDIT_MODELS.map((m) => m.value),
      ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'],
    );
  });

  // DEC-57: ux-audit and visual-audit ran on Opus; the default keeps them there
  it('defaults to Opus 5.5, the only choice marked recommended', () => {
    assert.equal(DEFAULT_AUDIT_MODEL, 'claude-opus-5-5');
    const recommended = AUDIT_MODELS.filter((m) => /recommended/.test(m.name));
    assert.deepEqual(
      recommended.map((m) => m.value),
      [DEFAULT_AUDIT_MODEL],
    );
  });

  // Skills accept the same values as /model: aliases on every provider, full
  // Anthropic API names only there (code.claude.com/docs/en/model-config)
  it('writes the family alias into the skills, and an unknown value as it is', () => {
    assert.equal(auditModelAlias('claude-sonnet-5-5'), 'sonnet');
    assert.equal(auditModelAlias('claude-opus-5-5'), 'opus');
    assert.equal(auditModelAlias('claude-fable-5-1'), 'fable');
    assert.equal(auditModelAlias('my-gateway-model'), 'my-gateway-model');
  });

  it('the context builder keeps its own model, not the audit default', () => {
    const llm = fs.readFileSync(path.join(SRC, 'context-builder/inference/llm.js'), 'utf8');
    assert.match(llm, /const DEFAULT_MODEL = 'claude-sonnet-5-5';/);
  });

  it('every wizard and interview default uses the shared constant', () => {
    const files = [
      'commands/init-greenfield.js',
      'commands/init-in-place.js',
      'context-builder/interview/dev-flow.js',
      'context-builder/interview/pm-flow.js',
    ];
    const hardcoded = files.filter((rel) =>
      /['"]claude-(sonnet|opus|fable|haiku)-[\d-]+['"]/.test(
        fs.readFileSync(path.join(SRC, rel), 'utf8'),
      ),
    );
    assert.deepEqual(hardcoded, []);
  });
});
