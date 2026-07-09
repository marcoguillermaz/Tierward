import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '../../src/index.js');
const TMP = path.join(__dirname, '../integration/output/add-test');

function run(args, cwd = TMP) {
  try {
    return execFileSync('node', [CLI, ...args.split(' ')], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (e) {
    return { stderr: e.stderr, stdout: e.stdout, exitCode: e.status };
  }
}

describe('add skill', () => {
  before(async () => {
    await fs.remove(TMP);
    await fs.ensureDir(path.join(TMP, '.claude'));
  });

  after(async () => {
    await fs.remove(TMP);
  });

  it('installs a skill file', () => {
    const out = run('add skill arch-audit');
    assert.ok(out.includes('Installed'));
    assert.ok(fs.existsSync(path.join(TMP, '.claude/skills/arch-audit/SKILL.md')));
  });

  it('warns on conflict without --force', () => {
    const out = run('add skill arch-audit');
    assert.ok(out.includes('already exists'));
  });

  it('overwrites with --force', () => {
    const out = run('add skill arch-audit --force');
    assert.ok(out.includes('Installed'));
  });

  it('rejects unknown skill name', () => {
    const result = run('add skill nonexistent');
    const text = result.stderr || result.stdout || '';
    assert.ok(text.includes('Unknown skill'));
  });

  it('lists available skills on unknown name', () => {
    const result = run('add skill nonexistent');
    const text = (result.stderr || '') + (result.stdout || '');
    assert.ok(text.includes('arch-audit'));
    assert.ok(text.includes('api-design'));
  });

  it('dry-run does not create files', async () => {
    await fs.remove(path.join(TMP, '.claude/skills/api-design'));
    const out = run('add skill api-design --dry-run');
    assert.ok(out.includes('Dry run'));
    assert.ok(!fs.existsSync(path.join(TMP, '.claude/skills/api-design/SKILL.md')));
  });

  it('fails without .claude/ directory', async () => {
    const noClaudeDir = path.join(TMP, '..', 'add-test-noclause');
    await fs.ensureDir(noClaudeDir);
    const result = run('add skill arch-audit', noClaudeDir);
    const text = result.stderr || result.stdout || '';
    assert.ok(text.includes('No .claude/ directory'));
    await fs.remove(noClaudeDir);
  });

  it('installs every universal Tier S registry skill', async () => {
    const skills = [
      'arch-audit',
      'commit',
      'simplify',
      'skill-dev',
      'perf-audit',
      'security-audit',
      'api-design',
      'skill-db',
      'responsive-audit',
      'visual-audit',
      'ux-audit',
      'ui-audit',
    ];
    for (const name of skills) {
      run(`add skill ${name} --force`);
      assert.ok(
        fs.existsSync(path.join(TMP, `.claude/skills/${name}/SKILL.md`)),
        `${name} should be installed`,
      );
    }
  });
});

describe('add rule', () => {
  before(async () => {
    await fs.remove(TMP);
    await fs.ensureDir(path.join(TMP, '.claude/rules'));
  });

  after(async () => {
    await fs.remove(TMP);
  });

  it('installs git rule', () => {
    const out = run('add rule git');
    assert.ok(out.includes('Installed'));
    assert.ok(fs.existsSync(path.join(TMP, '.claude/rules/git.md')));
  });

  it('installs output-style rule', () => {
    const out = run('add rule output-style');
    assert.ok(out.includes('Installed'));
    assert.ok(fs.existsSync(path.join(TMP, '.claude/rules/output-style.md')));
  });

  it('installs security rule (single neutral rule)', () => {
    const out = run('add rule security');
    assert.ok(out.includes('Installed'));
    const content = fs.readFileSync(path.join(TMP, '.claude/rules/security.md'), 'utf8');
    // Neutral rule covers universal security principles (input/SQL/secrets)
    assert.ok(content.includes('SQL') || content.includes('secrets') || content.includes('auth'));
  });

  it('warns on conflict without --force', () => {
    const out = run('add rule git');
    assert.ok(out.includes('already exists'));
  });

  it('rejects unknown rule name', () => {
    const result = run('add rule nonexistent');
    const text = result.stderr || result.stdout || '';
    assert.ok(text.includes('Unknown rule'));
  });

  it('dry-run does not write the rule', async () => {
    await fs.remove(path.join(TMP, '.claude/rules/security.md'));
    const out = run('add rule security --dry-run');
    assert.ok(out.includes('Dry run'));
    assert.ok(!fs.existsSync(path.join(TMP, '.claude/rules/security.md')));
  });
});

describe('add skill - CLAUDE.md Active Skills integration', () => {
  before(async () => {
    await fs.remove(TMP);
    await fs.ensureDir(path.join(TMP, '.claude'));
    // Create a CLAUDE.md with Active Skills section
    fs.writeFileSync(
      path.join(TMP, 'CLAUDE.md'),
      '# Project\n\n## Active Skills\n- `/arch-audit`\n\n## Other\n',
    );
  });

  after(async () => {
    await fs.remove(TMP);
  });

  it('appends new skill to Active Skills section', () => {
    run('add skill api-design');
    const content = fs.readFileSync(path.join(TMP, 'CLAUDE.md'), 'utf8');
    assert.ok(content.includes('/api-design'));
  });

  it('does not duplicate existing skill in Active Skills', () => {
    run('add skill arch-audit');
    const content = fs.readFileSync(path.join(TMP, 'CLAUDE.md'), 'utf8');
    const matches = content.match(/\/arch-audit/g);
    assert.equal(matches.length, 1, 'arch-audit should appear only once');
  });
});

describe('upgrade - custom skill preservation', () => {
  const UPGRADE_TMP = path.join(TMP, '..', 'upgrade-custom-test');

  before(async () => {
    await fs.remove(UPGRADE_TMP);
    // Simulate a Tierward project with a custom skill
    await fs.ensureDir(path.join(UPGRADE_TMP, '.claude', 'skills', 'custom-deploy'));
    fs.writeFileSync(
      path.join(UPGRADE_TMP, '.claude', 'skills', 'custom-deploy', 'SKILL.md'),
      '---\nname: custom-deploy\n---\nMy custom skill',
    );
    // Also add a Tierward-managed rule so upgrade has something to check
    await fs.ensureDir(path.join(UPGRADE_TMP, '.claude', 'rules'));
    fs.writeFileSync(path.join(UPGRADE_TMP, '.claude', 'rules', 'git.md'), 'old content');
  });

  after(async () => {
    await fs.remove(UPGRADE_TMP);
  });

  it('reports custom skills as preserved during upgrade', () => {
    const out = run('upgrade --dry-run', UPGRADE_TMP);
    assert.ok(out.includes('custom-deploy'), 'should list custom-deploy');
    assert.ok(out.includes('preserved'), 'should say preserved');
  });

  it('does not modify custom skill content during upgrade', () => {
    run('upgrade', UPGRADE_TMP);
    const content = fs.readFileSync(
      path.join(UPGRADE_TMP, '.claude', 'skills', 'custom-deploy', 'SKILL.md'),
      'utf8',
    );
    assert.equal(content, '---\nname: custom-deploy\n---\nMy custom skill');
  });
});
