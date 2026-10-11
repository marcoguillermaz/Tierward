import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIT_MODELS, DEFAULT_AUDIT_MODEL } from '../../src/utils/constants.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

describe('audit model choices', () => {
  it('offers the current Sonnet, Opus and Fable models', () => {
    assert.deepEqual(
      AUDIT_MODELS.map((m) => m.value),
      ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'],
    );
  });

  it('defaults to the first choice, marked recommended', () => {
    assert.equal(DEFAULT_AUDIT_MODEL, 'claude-sonnet-5-5');
    assert.equal(AUDIT_MODELS[0].value, DEFAULT_AUDIT_MODEL);
    assert.match(AUDIT_MODELS[0].name, /recommended/);
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
