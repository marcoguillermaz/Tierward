import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateContextFile,
  validateContextContent,
  parseContextFile,
  ValidationCode,
} from '../../../src/utils/validate-context.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../../fixtures/context-builder');
const fx = (name) => path.join(FIXTURES, name);

describe('parseContextFile', () => {
  it('returns error when no frontmatter delimiters', () => {
    const { frontmatter, error } = parseContextFile('# just a heading\n');
    assert.equal(frontmatter, null);
    assert.match(error, /No frontmatter/);
  });

  it('parses valid frontmatter into an object', () => {
    const src = '---\nfoo: bar\nnested:\n  key: 1\n---\n\nbody';
    const { frontmatter, body, error } = parseContextFile(src);
    assert.equal(error, null);
    assert.deepEqual(frontmatter, { foo: 'bar', nested: { key: 1 } });
    assert.equal(body, 'body');
  });

  it('returns YAML parse error on malformed yaml', () => {
    const src = '---\nfoo: [unclosed_array\nbar: 1\n---';
    const { frontmatter, error } = parseContextFile(src);
    assert.equal(frontmatter, null);
    assert.match(error, /YAML/);
  });
});

describe('validateContextFile — valid fixtures', () => {
  for (const file of [
    'valid-greenfield.md',
    'valid-in-place.md',
    'valid-from-context.md',
    'valid-tier-0.md',
    'valid-tier-m.md',
    'valid-tier-l.md',
  ]) {
    it(`${file} passes`, () => {
      const result = validateContextFile(fx(file));
      assert.equal(
        result.valid,
        true,
        `Expected valid but got errors: ${JSON.stringify(result.errors)}`,
      );
      assert.equal(result.errors.length, 0);
      assert.ok(result.data, 'data should be present');
    });
  }
});

describe('validateContextFile — file-level errors', () => {
  it('FILE_NOT_FOUND for non-existent path', () => {
    const result = validateContextFile('/tmp/does-not-exist-12345.md');
    assert.equal(result.valid, false);
    assert.equal(result.errors[0].code, ValidationCode.FILE_NOT_FOUND);
  });

  it('EMPTY_FILE for empty content', () => {
    const result = validateContextFile(fx('invalid-empty.md'));
    assert.equal(result.valid, false);
    assert.equal(result.errors[0].code, ValidationCode.EMPTY_FILE);
  });

  it('NO_FRONTMATTER when delimiters missing', () => {
    const result = validateContextFile(fx('invalid-no-frontmatter.md'));
    assert.equal(result.valid, false);
    assert.equal(result.errors[0].code, ValidationCode.NO_FRONTMATTER);
  });

  it('YAML_PARSE_ERROR on bad yaml syntax', () => {
    const result = validateContextFile(fx('invalid-yaml-syntax.md'));
    assert.equal(result.valid, false);
    assert.equal(result.errors[0].code, ValidationCode.YAML_PARSE_ERROR);
  });
});

describe('validateContextFile — schema violations', () => {
  it('fails on missing required field (stack)', () => {
    const result = validateContextFile(fx('invalid-missing-required.md'));
    assert.equal(result.valid, false);
    assert.equal(result.errors[0].code, ValidationCode.SCHEMA_VIOLATION);
    const hasStackError = result.errors.some((e) => e.path.includes('stack'));
    assert.ok(hasStackError, 'expected an error on path "stack"');
  });

  it('fails on enum value outside STACK_PRIMARY', () => {
    const result = validateContextFile(fx('invalid-wrong-enum.md'));
    assert.equal(result.valid, false);
    const hasPrimaryError = result.errors.some(
      (e) => e.path.includes('stack') && e.path.includes('primary'),
    );
    assert.ok(hasPrimaryError, 'expected an error on stack.primary');
  });

  it('fails on empty tier.rationale', () => {
    const result = validateContextFile(fx('invalid-empty-rationale.md'));
    assert.equal(result.valid, false);
    const hasRationaleError = result.errors.some(
      (e) => e.path.includes('tier') && e.path.includes('rationale'),
    );
    assert.ok(hasRationaleError, 'expected an error on tier.rationale');
  });
});

describe('validateContextFile — inter-field constraints', () => {
  it('C1: tier=0 + include_pre_commit=true fails', () => {
    const result = validateContextFile(fx('invalid-c1-tier0-with-precommit.md'));
    assert.equal(result.valid, false);
    const hasC1 = result.errors.some((e) => /Tier 0/.test(e.message));
    assert.ok(hasC1, `expected a Tier 0 error, got: ${JSON.stringify(result.errors)}`);
  });

  it('C2: mode=from-context without sources fails', () => {
    const result = validateContextFile(fx('invalid-c2-from-context-no-sources.md'));
    assert.equal(result.valid, false);
    const hasC2 = result.errors.some((e) => /from-context.*sources/.test(e.message));
    assert.ok(hasC2, `expected a from-context error, got: ${JSON.stringify(result.errors)}`);
  });

  it('C3: mode=greenfield with sources fails', () => {
    const result = validateContextFile(fx('invalid-c3-greenfield-with-sources.md'));
    assert.equal(result.valid, false);
    const hasC3 = result.errors.some((e) => /greenfield.*sources/.test(e.message));
    assert.ok(hasC3, `expected a greenfield/sources error, got: ${JSON.stringify(result.errors)}`);
  });

  it('C4: mode=in-place without inference fails', () => {
    const result = validateContextFile(fx('invalid-c4-inplace-no-inference.md'));
    assert.equal(result.valid, false);
    const hasC4 = result.errors.some((e) => /in-place.*inference/.test(e.message));
    assert.ok(hasC4, `expected an in-place/inference error, got: ${JSON.stringify(result.errors)}`);
  });

  it('C5: invalid confidence dotted-path fails', () => {
    const result = validateContextFile(fx('invalid-c5-bad-confidence-path.md'));
    assert.equal(result.valid, false);
    const hasC5 = result.errors.some((e) => /Invalid dotted-path/.test(e.message));
    assert.ok(hasC5, `expected a dotted-path error, got: ${JSON.stringify(result.errors)}`);
  });

  it('C6: invalid pending_decisions[].field fails', () => {
    const result = validateContextFile(fx('invalid-c6-bad-pending-path.md'));
    assert.equal(result.valid, false);
    const hasC6 = result.errors.some(
      (e) => /Invalid dotted-path/.test(e.message) && e.path[0] === 'pending_decisions',
    );
    assert.ok(
      hasC6,
      `expected a pending_decisions dotted-path error, got: ${JSON.stringify(result.errors)}`,
    );
  });

  it('C7 (v1.27.0+): has_design_system=true without design_system_name fails', () => {
    const result = validateContextFile(fx('invalid-c7-design-system-missing-name.md'));
    assert.equal(result.valid, false);
    const hasC7 = result.errors.some(
      (e) => /design_system_name/.test(e.message) && e.path.includes('design_system_name'),
    );
    assert.ok(hasC7, `expected design_system_name error, got: ${JSON.stringify(result.errors)}`);
  });

  it('C8 (v1.27.0+): features block on tier S fails', () => {
    const result = validateContextFile(fx('invalid-c8-features-on-tier-s.md'));
    assert.equal(result.valid, false);
    const hasC8 = result.errors.some((e) => /features block requires tier M or L/.test(e.message));
    assert.ok(hasC8, `expected C8 error, got: ${JSON.stringify(result.errors)}`);
  });
});

describe('validateContextContent (string input)', () => {
  it('rejects empty string', () => {
    const result = validateContextContent('');
    assert.equal(result.valid, false);
    assert.equal(result.errors[0].code, ValidationCode.EMPTY_FILE);
  });

  it('rejects whitespace-only string', () => {
    const result = validateContextContent('   \n\n  ');
    assert.equal(result.valid, false);
    assert.equal(result.errors[0].code, ValidationCode.EMPTY_FILE);
  });
});
