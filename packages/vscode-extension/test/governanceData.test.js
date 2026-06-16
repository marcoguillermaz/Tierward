'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CdkBackend } = require('../dist/cdkBackend.js');

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-fixture-'));
  writeFile(
    path.join(root, '.claude', 'skills', 'doc-audit', 'SKILL.md'),
    '---\nname: doc-audit\ndescription: Audits docs.\nmodel: sonnet\nuser-invocable: true\n---\n# body\n',
  );
  writeFile(
    path.join(root, '.claude', 'skills', 'custom-thing', 'SKILL.md'),
    '---\nname: custom-thing\ndescription: A custom skill.\n---\n',
  );
  // Directory without a SKILL.md must be skipped.
  fs.mkdirSync(path.join(root, '.claude', 'skills', 'empty-dir'), { recursive: true });
  writeFile(path.join(root, '.claude', 'rules', 'git.md'), '# Git Conventions\n\ntext\n');
  writeFile(path.join(root, '.claude', 'rules', 'security.md'), '# Security\n');
  // Non-markdown files in rules/ must be ignored.
  writeFile(path.join(root, '.claude', 'rules', 'notes.txt'), 'ignore me\n');
  return root;
}

test('getSkillInventory lists skills with frontmatter and custom flag, sorted', async () => {
  const root = makeFixture();
  try {
    const skills = await new CdkBackend({ projectRoot: root }).getSkillInventory();
    assert.deepEqual(
      skills.map((s) => s.name),
      ['custom-thing', 'doc-audit'],
    );

    const docAudit = skills.find((s) => s.name === 'doc-audit');
    assert.equal(docAudit.isCustom, false);
    assert.equal(docAudit.description, 'Audits docs.');
    assert.equal(docAudit.model, 'sonnet');
    assert.equal(docAudit.userInvocable, true);
    assert.ok(docAudit.path.endsWith(path.join('doc-audit', 'SKILL.md')));

    const custom = skills.find((s) => s.name === 'custom-thing');
    assert.equal(custom.isCustom, true);
    assert.equal(custom.userInvocable, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('getSkillInventory returns empty when .claude/skills is absent', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-empty-'));
  try {
    assert.deepEqual(await new CdkBackend({ projectRoot: root }).getSkillInventory(), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('getRules lists .md rule files with first-heading titles, sorted', async () => {
  const root = makeFixture();
  try {
    const rules = await new CdkBackend({ projectRoot: root }).getRules();
    assert.deepEqual(
      rules.map((r) => r.name),
      ['git', 'security'],
    );
    assert.equal(rules[0].title, 'Git Conventions');
    assert.equal(rules[1].title, 'Security');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
