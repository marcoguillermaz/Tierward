import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { ANTHROPIC_FILES, backupPath, detectScaffoldedTier } from '../../src/commands/upgrade.js';

describe('ANTHROPIC_FILES registry', () => {
  it('contains the v1.15.0 1:1-scaffolded Anthropic-influenced file', () => {
    const targets = ANTHROPIC_FILES.map((e) => e.target).sort();
    assert.deepEqual(targets, ['.claude/skills/arch-audit/advanced-checks.md']);
  });

  it('every entry resolves to either a static template or a tier-aware template path', () => {
    for (const entry of ANTHROPIC_FILES) {
      const hasStatic = typeof entry.template === 'string' && entry.template.length > 0;
      const hasTierAware =
        typeof entry.templateTierAware === 'string' && entry.templateTierAware.includes('{TIER}');
      assert.ok(hasStatic || hasTierAware, `${entry.target} has no template path`);
    }
  });

  it('tier-aware entries cover only the tier-specific skill directory', () => {
    const tierAware = ANTHROPIC_FILES.filter((e) => e.templateTierAware);
    for (const entry of tierAware) {
      assert.match(entry.target, /^\.claude\/skills\/arch-audit\//);
    }
  });
});

describe('backupPath', () => {
  it('appends .bak.<ISO timestamp without milliseconds and Z>', () => {
    const fixed = new Date('2026-04-25T14:30:45.123Z');
    const out = backupPath('/tmp/foo/file.md', fixed);
    assert.equal(out, '/tmp/foo/file.md.bak.2026-04-25T14-30-45');
  });

  it('produces unique paths when called more than a second apart', () => {
    const a = backupPath('/tmp/file.md', new Date('2026-04-25T14:30:00Z'));
    const b = backupPath('/tmp/file.md', new Date('2026-04-25T14:30:01Z'));
    assert.notEqual(a, b);
  });

  it('preserves the original extension in the suffix-free portion', () => {
    const out = backupPath('/path/to/file.md', new Date('2026-04-25T14:30:00Z'));
    // .bak suffix sits AFTER the original extension, so the original ext is still recoverable
    assert.match(out, /file\.md\.bak\./);
  });
});

describe('detectScaffoldedTier', () => {
  let tmp;

  function makeTmp() {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tierward-detect-tier-'));
    return tmp;
  }

  function cleanup() {
    if (tmp && fs.existsSync(tmp)) fs.removeSync(tmp);
  }

  it('returns null when pipeline.md is missing', () => {
    const dir = makeTmp();
    try {
      assert.equal(detectScaffoldedTier(dir), null);
    } finally {
      cleanup();
    }
  });

  it('detects tier S via "Fast Lane Pipeline" header', () => {
    const dir = makeTmp();
    try {
      const p = path.join(dir, '.claude/rules/pipeline.md');
      fs.ensureDirSync(path.dirname(p));
      fs.writeFileSync(p, '# Fast Lane Pipeline\n\nUse for: ...');
      assert.equal(detectScaffoldedTier(dir), 's');
    } finally {
      cleanup();
    }
  });

  it('detects tier M via "Standard Development Pipeline - Tier M" header', () => {
    const dir = makeTmp();
    try {
      const p = path.join(dir, '.claude/rules/pipeline.md');
      fs.ensureDirSync(path.dirname(p));
      fs.writeFileSync(p, '# Standard Development Pipeline - Tier M\n');
      assert.equal(detectScaffoldedTier(dir), 'm');
    } finally {
      cleanup();
    }
  });

  it('detects tier L via "Full Development Pipeline - Tier L" header', () => {
    const dir = makeTmp();
    try {
      const p = path.join(dir, '.claude/rules/pipeline.md');
      fs.ensureDirSync(path.dirname(p));
      fs.writeFileSync(p, '# Full Development Pipeline - Tier L\n');
      assert.equal(detectScaffoldedTier(dir), 'l');
    } finally {
      cleanup();
    }
  });

  it('returns null for an unrecognized H1', () => {
    const dir = makeTmp();
    try {
      const p = path.join(dir, '.claude/rules/pipeline.md');
      fs.ensureDirSync(path.dirname(p));
      fs.writeFileSync(p, '# Custom Pipeline\n\nUnknown shape.');
      assert.equal(detectScaffoldedTier(dir), null);
    } finally {
      cleanup();
    }
  });
});
