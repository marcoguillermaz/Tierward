import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '../../src/index.js');
const TMP = path.resolve(__dirname, '../integration/output/new-skill-test');

function run(args, cwd = TMP) {
  const argList = Array.isArray(args) ? args : args.split(' ');
  try {
    return execFileSync('node', [CLI, ...argList], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (e) {
    return { stderr: e.stderr, stdout: e.stdout, exitCode: e.status };
  }
}

function answersArgs(overrides = {}) {
  const base = {
    name: 'deploy',
    description: 'Deploy the application to staging and run smoke tests.',
    model: 'haiku',
    userInvocable: true,
    effort: 'medium',
    usesPlaywright: false,
    stepCount: 3,
  };
  return ['new', 'skill', '--answers', JSON.stringify({ ...base, ...overrides })];
}

// ---------------------------------------------------------------------------
// Test helpers - internal functions
// ---------------------------------------------------------------------------

import { _testHelpers } from '../../src/commands/new-skill.js';
const { normalizeName, buildSkillMd, buildTestFixture, validateSkillMd } = _testHelpers;

describe('normalizeName', () => {
  it('prepends custom- to bare name', () => {
    assert.equal(normalizeName('deploy'), 'custom-deploy');
  });

  it('preserves existing custom- prefix', () => {
    assert.equal(normalizeName('custom-deploy'), 'custom-deploy');
  });

  it('lowercases and replaces spaces with hyphens', () => {
    assert.equal(normalizeName('My Cool Skill'), 'custom-my-cool-skill');
  });

  it('trims whitespace', () => {
    assert.equal(normalizeName('  deploy  '), 'custom-deploy');
  });
});

describe('buildSkillMd', () => {
  it('generates valid frontmatter with all required fields', () => {
    const md = buildSkillMd({
      name: 'custom-test',
      description: 'A test skill.',
      model: 'sonnet',
      userInvocable: true,
      effort: 'medium',
      stepCount: 3,
    });
    assert.ok(md.startsWith('---\n'));
    assert.ok(md.includes('name: custom-test'));
    assert.ok(md.includes('description: A test skill.'));
    assert.ok(md.includes('model: sonnet'));
    assert.ok(md.includes('user-invocable: true'));
    assert.ok(md.includes('context: fork'));
    // Forked skills run in the background by default (Claude Code v2.1.218+)
    assert.ok(md.includes('background: false'));
    assert.ok(md.includes('effort: medium'));
  });

  it('omits effort when set to (skip)', () => {
    const md = buildSkillMd({
      name: 'custom-test',
      description: 'Test.',
      model: 'haiku',
      effort: '(skip)',
      stepCount: 2,
    });
    assert.ok(!md.includes('effort:'));
  });

  it('omits argumentHint when empty', () => {
    const md = buildSkillMd({
      name: 'custom-test',
      description: 'Test.',
      model: 'haiku',
      argumentHint: '',
      stepCount: 2,
    });
    assert.ok(!md.includes('argument-hint:'));
  });

  it('includes argumentHint when provided', () => {
    const md = buildSkillMd({
      name: 'custom-test',
      description: 'Test.',
      model: 'haiku',
      argumentHint: '[quick|full]',
      stepCount: 2,
    });
    assert.ok(md.includes('argument-hint: [quick|full]'));
  });

  it('includes allowed-tools when provided', () => {
    const md = buildSkillMd({
      name: 'custom-test',
      description: 'Test.',
      model: 'opus',
      allowedTools: 'Read, Glob, mcp__playwright__browser_navigate',
      stepCount: 2,
    });
    assert.ok(md.includes('allowed-tools: Read, Glob, mcp__playwright__browser_navigate'));
  });

  it('generates correct number of steps', () => {
    const md = buildSkillMd({
      name: 'custom-test',
      description: 'Test.',
      model: 'haiku',
      stepCount: 4,
    });
    assert.ok(md.includes('## Step 1 - [action]'));
    assert.ok(md.includes('## Step 2 - [action]'));
    assert.ok(md.includes('## Step 3 - [action]'));
    assert.ok(md.includes('## Step 4 - Produce report'));
  });

  it('last step is always "Produce report"', () => {
    const md = buildSkillMd({
      name: 'custom-test',
      description: 'Test.',
      model: 'haiku',
      stepCount: 2,
    });
    assert.ok(md.includes('## Step 2 - Produce report'));
    assert.ok(!md.includes('## Step 1 - Produce report'));
  });

  it('context is always fork regardless of input', () => {
    const md = buildSkillMd({
      name: 'custom-test',
      description: 'Test.',
      model: 'haiku',
      stepCount: 2,
    });
    assert.ok(md.includes('context: fork'));
  });
});

describe('validateSkillMd', () => {
  it('passes for valid SKILL.md', () => {
    const md = buildSkillMd({
      name: 'custom-test',
      description: 'A valid test skill for unit testing purposes.',
      model: 'sonnet',
      stepCount: 2,
    });
    const { errors } = validateSkillMd(md, 'custom-test');
    assert.equal(errors.length, 0);
  });

  it('errors on missing frontmatter', () => {
    const { errors } = validateSkillMd('# No frontmatter', 'custom-test');
    assert.ok(errors.some((e) => e.includes('frontmatter')));
  });

  it('errors on name mismatch', () => {
    const md = buildSkillMd({
      name: 'custom-wrong',
      description: 'A valid test skill.',
      model: 'haiku',
      stepCount: 2,
    });
    const { errors } = validateSkillMd(md, 'custom-right');
    assert.ok(errors.some((e) => e.includes('does not match')));
  });

  it('errors on description over 250 chars', () => {
    const md = buildSkillMd({
      name: 'custom-test',
      description: 'A'.repeat(251),
      model: 'haiku',
      stepCount: 2,
    });
    const { errors } = validateSkillMd(md, 'custom-test');
    assert.ok(errors.some((e) => e.includes('too long')));
  });

  it('warns on short description', () => {
    const md = buildSkillMd({
      name: 'custom-test',
      description: 'Short.',
      model: 'haiku',
      stepCount: 2,
    });
    const { warnings } = validateSkillMd(md, 'custom-test');
    assert.ok(warnings.some((w) => w.includes('very short')));
  });
});

describe('buildTestFixture', () => {
  it('returns valid JavaScript', () => {
    const fixture = buildTestFixture('custom-deploy');
    assert.ok(fixture.includes('import { readFileSync }'));
    assert.ok(fixture.includes('custom-deploy'));
    assert.ok(fixture.includes('context: fork'));
  });
});

// ---------------------------------------------------------------------------
// CLI integration via --answers
// ---------------------------------------------------------------------------

describe('new skill - CLI', () => {
  before(async () => {
    await fs.remove(TMP);
    await fs.ensureDir(path.join(TMP, '.claude'));
    await fs.writeFile(
      path.join(TMP, 'CLAUDE.md'),
      '# Test Project\n\n## Active Skills\n- `/arch-audit`\n\n## Environment\nNode 22\n',
    );
  });

  after(async () => {
    await fs.remove(TMP);
  });

  it('creates skill directory and SKILL.md', () => {
    const out = run(answersArgs());
    assert.ok(typeof out === 'string');
    assert.ok(out.includes('Created .claude/skills/custom-deploy/SKILL.md'));
    assert.ok(fs.existsSync(path.join(TMP, '.claude', 'skills', 'custom-deploy', 'SKILL.md')));
  });

  it('creates test-skill.js alongside SKILL.md', () => {
    assert.ok(fs.existsSync(path.join(TMP, '.claude', 'skills', 'custom-deploy', 'test-skill.js')));
  });

  it('generated SKILL.md has all required frontmatter fields', () => {
    const content = fs.readFileSync(
      path.join(TMP, '.claude', 'skills', 'custom-deploy', 'SKILL.md'),
      'utf8',
    );
    assert.ok(content.includes('name: custom-deploy'));
    assert.ok(content.includes('description:'));
    assert.ok(content.includes('user-invocable: true'));
    assert.ok(content.includes('model: haiku'));
    assert.ok(content.includes('context: fork'));
  });

  it('registers in CLAUDE.md Active Skills', () => {
    const content = fs.readFileSync(path.join(TMP, 'CLAUDE.md'), 'utf8');
    assert.ok(content.includes('/custom-deploy'));
  });

  it('does not duplicate in CLAUDE.md on second run', () => {
    // Remove skill file to allow re-creation
    fs.removeSync(path.join(TMP, '.claude', 'skills', 'custom-deploy'));
    run(answersArgs());
    const content = fs.readFileSync(path.join(TMP, 'CLAUDE.md'), 'utf8');
    const count = content.split('/custom-deploy').length - 1;
    assert.equal(count, 1, 'Should appear exactly once');
  });

  it('rejects if skill already exists', () => {
    const out = run(answersArgs());
    // out is a string (stdout) or object with stderr
    const text = typeof out === 'string' ? out : out.stdout || '';
    assert.ok(text.includes('already exists'));
  });

  it('--dry-run does not create files', async () => {
    await fs.remove(path.join(TMP, '.claude', 'skills', 'custom-drytest'));
    run([
      'new',
      'skill',
      '--dry-run',
      '--answers',
      JSON.stringify({ name: 'drytest', description: 'Dry test.', model: 'haiku', stepCount: 2 }),
    ]);
    assert.ok(!fs.existsSync(path.join(TMP, '.claude', 'skills', 'custom-drytest')));
  });

  it('fails without .claude/ directory', async () => {
    const emptyDir = path.join(TMP, '..', 'new-skill-no-claude');
    await fs.ensureDir(emptyDir);
    const out = run(answersArgs(), emptyDir);
    assert.ok(out.stderr && out.stderr.includes('No .claude/ directory'));
    await fs.remove(emptyDir);
  });

  it('includes allowed-tools when usesPlaywright is true', async () => {
    await fs.remove(path.join(TMP, '.claude', 'skills', 'custom-visual'));
    run(
      answersArgs({
        name: 'visual',
        usesPlaywright: true,
        allowedTools: 'mcp__playwright__browser_navigate, mcp__playwright__browser_take_screenshot',
      }),
    );
    const content = fs.readFileSync(
      path.join(TMP, '.claude', 'skills', 'custom-visual', 'SKILL.md'),
      'utf8',
    );
    assert.ok(content.includes('allowed-tools:'));
    assert.ok(content.includes('mcp__playwright__browser_navigate'));
  });

  it('omits effort field when set to (skip)', async () => {
    await fs.remove(path.join(TMP, '.claude', 'skills', 'custom-noeffort'));
    run(answersArgs({ name: 'noeffort', effort: '(skip)' }));
    const content = fs.readFileSync(
      path.join(TMP, '.claude', 'skills', 'custom-noeffort', 'SKILL.md'),
      'utf8',
    );
    assert.ok(!content.includes('effort:'));
  });
});
