import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NATIVE_STACKS,
  SKILL_REGISTRY,
  getSkillsToRemove,
  getActiveSkills,
  getCheatsheetSkillsToRemove,
} from '../../src/scaffold/skill-registry.js';

// ---------------------------------------------------------------------------
// NATIVE_STACKS
// ---------------------------------------------------------------------------

describe('NATIVE_STACKS', () => {
  it('contains the 5 expected native stacks', () => {
    assert.deepEqual(NATIVE_STACKS, ['swift', 'kotlin', 'rust', 'dotnet', 'java']);
  });
});

// ---------------------------------------------------------------------------
// SKILL_REGISTRY structure
// ---------------------------------------------------------------------------

describe('SKILL_REGISTRY', () => {
  it('has 25 entries', () => {
    assert.equal(SKILL_REGISTRY.length, 25);
  });

  it('every entry has required fields', () => {
    for (const s of SKILL_REGISTRY) {
      assert.ok(typeof s.name === 'string', `${s.name} missing name`);
      assert.ok(['s', 'm', 'l'].includes(s.minTier), `${s.name} invalid minTier`);
      assert.ok(typeof s.requires === 'object', `${s.name} missing requires`);
      assert.ok(typeof s.cheatsheet === 'boolean', `${s.name} missing cheatsheet`);
    }
  });

  it('names are unique', () => {
    const names = SKILL_REGISTRY.map((s) => s.name);
    assert.equal(new Set(names).size, names.length);
  });
});

// ---------------------------------------------------------------------------
// getSkillsToRemove()
// ---------------------------------------------------------------------------

describe('getSkillsToRemove', () => {
  it('all flags true + web stack: removes nothing', () => {
    const result = getSkillsToRemove({
      techStack: 'node-ts',
      hasApi: true,
      hasDatabase: true,
      hasFrontend: true,
      hasDesignSystem: true,
    });
    assert.equal(result.length, 0);
  });

  it('hasApi=false removes api-design but keeps security-audit', () => {
    const result = getSkillsToRemove({ techStack: 'node-ts', hasApi: false });
    assert.ok(result.includes('api-design'));
    assert.ok(!result.includes('security-audit'));
    assert.ok(!result.includes('perf-audit'));
  });

  it('hasDatabase=false removes skill-db and migration-audit', () => {
    const result = getSkillsToRemove({ techStack: 'node-ts', hasDatabase: false });
    assert.ok(result.includes('skill-db'));
    assert.ok(result.includes('migration-audit'));
    assert.equal(result.length, 2);
  });

  it('hasFrontend=false removes all 5 frontend skills', () => {
    const result = getSkillsToRemove({ techStack: 'node-ts', hasFrontend: false });
    assert.ok(result.includes('responsive-audit'));
    assert.ok(result.includes('visual-audit'));
    assert.ok(result.includes('ux-audit'));
    assert.ok(result.includes('ui-audit'));
    assert.ok(result.includes('accessibility-audit'));
  });

  it('native stack removes browser-only skills (responsive, visual, ux, accessibility)', () => {
    const result = getSkillsToRemove({ techStack: 'swift' });
    assert.ok(result.includes('responsive-audit'));
    assert.ok(result.includes('visual-audit'));
    assert.ok(result.includes('ux-audit'));
    assert.ok(result.includes('accessibility-audit'));
  });

  it('hasDesignSystem=false removes ui-audit', () => {
    const result = getSkillsToRemove({ techStack: 'node-ts', hasDesignSystem: false });
    assert.ok(result.includes('ui-audit'));
    assert.ok(!result.includes('visual-audit'));
  });

  it('combined: hasApi=false + hasFrontend=false removes both groups but keeps security-audit', () => {
    const result = getSkillsToRemove({ techStack: 'node-ts', hasApi: false, hasFrontend: false });
    assert.ok(result.includes('api-design'));
    assert.ok(!result.includes('security-audit'));
    assert.ok(result.includes('responsive-audit'));
    assert.ok(result.includes('visual-audit'));
    assert.ok(result.includes('ux-audit'));
    assert.ok(result.includes('ui-audit'));
    assert.ok(result.includes('accessibility-audit'));
    assert.ok(!result.includes('perf-audit'));
    assert.ok(!result.includes('skill-dev'));
  });

  it('undefined flags are treated as true (not removed)', () => {
    const result = getSkillsToRemove({ techStack: 'node-ts' });
    assert.equal(result.length, 0);
  });
});

// ---------------------------------------------------------------------------
// getActiveSkills()
// ---------------------------------------------------------------------------

describe('getActiveSkills', () => {
  it('tier S default: base skills + security-audit, no pipeline skills', () => {
    const result = getActiveSkills({ tier: 's' });
    assert.ok(result.includes('arch-audit'));
    assert.ok(result.includes('skill-dev'));
    assert.ok(result.includes('perf-audit'));
    assert.ok(result.includes('simplify'));
    assert.ok(result.includes('commit'));
    assert.ok(result.includes('security-audit'));
    assert.ok(!result.includes('api-design'));
    assert.ok(!result.includes('skill-db'));
    assert.ok(!result.includes('dependency-scan'));
    assert.ok(!result.includes('context-review'));
  });

  it('tier M includes dependency-scan but not context-review', () => {
    const result = getActiveSkills({ tier: 'm' });
    assert.ok(result.includes('dependency-scan'));
    assert.ok(!result.includes('context-review'));
  });

  it('tier L includes both dependency-scan and context-review', () => {
    const result = getActiveSkills({ tier: 'l' });
    assert.ok(result.includes('dependency-scan'));
    assert.ok(result.includes('context-review'));
  });

  it('tier S hasApi=false keeps security-audit (stack-agnostic)', () => {
    const result = getActiveSkills({ tier: 's', hasApi: false });
    assert.ok(result.includes('security-audit'));
    assert.ok(result.includes('arch-audit'));
  });

  it('tier M all-true includes full set', () => {
    const result = getActiveSkills({
      tier: 'm',
      hasApi: true,
      hasDatabase: true,
      hasFrontend: true,
      hasDesignSystem: true,
    });
    assert.ok(result.includes('api-design'));
    assert.ok(result.includes('security-audit'));
    assert.ok(result.includes('skill-db'));
    assert.ok(result.includes('migration-audit'));
    assert.ok(result.includes('responsive-audit'));
    assert.ok(result.includes('visual-audit'));
    assert.ok(result.includes('ux-audit'));
    assert.ok(result.includes('ui-audit'));
    assert.ok(result.includes('accessibility-audit'));
  });

  it('tier M hasDatabase=false excludes migration-audit', () => {
    const result = getActiveSkills({ tier: 'm', hasDatabase: false });
    assert.ok(!result.includes('migration-audit'));
    assert.ok(!result.includes('skill-db'));
  });

  it('tier L hasDatabase=true includes migration-audit', () => {
    const result = getActiveSkills({ tier: 'l', hasDatabase: true });
    assert.ok(result.includes('migration-audit'));
  });

  it('tier M hasApi=false excludes api-design but keeps security-audit', () => {
    const result = getActiveSkills({ tier: 'm', hasApi: false });
    assert.ok(!result.includes('api-design'));
    assert.ok(result.includes('security-audit'));
  });

  it('tier M hasFrontend=false excludes all frontend skills', () => {
    const result = getActiveSkills({ tier: 'm', hasFrontend: false });
    assert.ok(!result.includes('responsive-audit'));
    assert.ok(!result.includes('visual-audit'));
    assert.ok(!result.includes('ux-audit'));
    assert.ok(!result.includes('ui-audit'));
    assert.ok(!result.includes('accessibility-audit'));
  });

  it('tier M hasFrontend=true includes accessibility-audit', () => {
    const result = getActiveSkills({ tier: 'm', hasFrontend: true });
    assert.ok(result.includes('accessibility-audit'));
  });

  it('tier S excludes accessibility-audit (minTier m)', () => {
    const result = getActiveSkills({ tier: 's', hasFrontend: true });
    assert.ok(!result.includes('accessibility-audit'));
  });

  it('tier L hasFrontend=true includes accessibility-audit', () => {
    const result = getActiveSkills({ tier: 'l', hasFrontend: true });
    assert.ok(result.includes('accessibility-audit'));
  });

  it('tier S excludes test-audit (minTier m)', () => {
    const result = getActiveSkills({ tier: 's' });
    assert.ok(!result.includes('test-audit'));
  });

  it('tier M includes test-audit regardless of feature flags', () => {
    const result = getActiveSkills({
      tier: 'm',
      hasApi: false,
      hasDatabase: false,
      hasFrontend: false,
      hasDesignSystem: false,
    });
    assert.ok(result.includes('test-audit'));
  });

  it('tier L includes test-audit on native stacks (no excludeNative)', () => {
    const result = getActiveSkills({ tier: 'l', techStack: 'swift' });
    assert.ok(result.includes('test-audit'));
  });

  it('tier M hasDesignSystem=false excludes ui-audit but keeps other frontend', () => {
    const result = getActiveSkills({ tier: 'm', hasFrontend: true, hasDesignSystem: false });
    assert.ok(!result.includes('ui-audit'));
    assert.ok(result.includes('visual-audit'));
    assert.ok(result.includes('ux-audit'));
  });

  it('tier M native stack excludes browser-only skills (responsive, visual, ux, accessibility)', () => {
    const result = getActiveSkills({ tier: 'm', techStack: 'swift', hasFrontend: true });
    assert.ok(!result.includes('responsive-audit'));
    assert.ok(!result.includes('visual-audit'));
    assert.ok(!result.includes('ux-audit'));
    assert.ok(!result.includes('accessibility-audit'));
  });

  it('tier defaults to S when missing', () => {
    const result = getActiveSkills({});
    assert.ok(!result.includes('api-design'));
    assert.ok(result.includes('security-audit'));
  });
});

// ---------------------------------------------------------------------------
// getCheatsheetSkillsToRemove()
// ---------------------------------------------------------------------------

describe('getCheatsheetSkillsToRemove', () => {
  it('all flags true: removes nothing', () => {
    const result = getCheatsheetSkillsToRemove({
      techStack: 'node-ts',
      hasApi: true,
      hasDatabase: true,
    });
    assert.equal(result.length, 0);
  });

  it('hasApi=false removes api-design from cheatsheet but keeps security-audit', () => {
    const result = getCheatsheetSkillsToRemove({ techStack: 'node-ts', hasApi: false });
    assert.ok(!result.includes('security-audit'));
    assert.ok(result.includes('api-design'));
  });

  it('hasDatabase=false removes skill-db and migration-audit from cheatsheet', () => {
    const result = getCheatsheetSkillsToRemove({ techStack: 'node-ts', hasDatabase: false });
    assert.ok(result.includes('skill-db'));
    assert.ok(result.includes('migration-audit'));
    assert.equal(result.length, 2);
  });

  it('hasFrontend=false removes all frontend cheatsheet skills', () => {
    const result = getCheatsheetSkillsToRemove({ techStack: 'node-ts', hasFrontend: false });
    // All 5 frontend skills now have cheatsheet=true → all returned when hasFrontend=false
    assert.ok(result.includes('responsive-audit'));
    assert.ok(result.includes('visual-audit'));
    assert.ok(result.includes('ux-audit'));
    assert.ok(result.includes('ui-audit'));
    assert.ok(result.includes('accessibility-audit'));
    assert.equal(result.length, 5);
  });
});
