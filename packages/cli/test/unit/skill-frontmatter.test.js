import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  parseSkillFile,
  extractFields,
  countBodyLines,
} from '../../src/utils/skill-frontmatter.js';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = path.join(PACKAGE_ROOT, 'src', 'index.js');

describe('parseSkillFile', () => {
  it('returns null frontmatter when no delimiters present', () => {
    const { frontmatter, body, fields } = parseSkillFile('Just body content.\n');
    assert.equal(frontmatter, null);
    assert.equal(body, 'Just body content.\n');
    assert.deepEqual(fields, {});
  });

  it('extracts frontmatter and body from well-formed SKILL.md', () => {
    const src = `---
name: test-skill
description: A short description.
context: fork
---

Body content starts here.
Line two.`;
    const { frontmatter, body, fields } = parseSkillFile(src);
    assert.ok(frontmatter.includes('name: test-skill'));
    assert.equal(body, 'Body content starts here.\nLine two.');
    assert.equal(fields.name, 'test-skill');
    assert.equal(fields.description, 'A short description.');
    assert.equal(fields.context, 'fork');
  });

  it('captures allowed-tools value when present', () => {
    const src = `---
name: x
allowed-tools: Read Glob Grep
---

body`;
    const { fields } = parseSkillFile(src);
    assert.equal(fields.allowedTools, 'Read Glob Grep');
  });
});

describe('extractFields', () => {
  it('returns null for unspecified fields', () => {
    const fields = extractFields('name: x');
    assert.equal(fields.name, 'x');
    assert.equal(fields.description, null);
    assert.equal(fields.model, null);
  });
});

describe('countBodyLines', () => {
  it('returns 0 for empty body', () => {
    assert.equal(countBodyLines(''), 0);
    assert.equal(countBodyLines('\n\n\n'), 0);
  });

  it('counts lines ignoring trailing newlines', () => {
    assert.equal(countBodyLines('line 1\nline 2\nline 3\n\n\n'), 3);
    assert.equal(countBodyLines('only one line'), 1);
  });
});

// Claude Code accepts `allowed-tools` as a space- or comma-separated string, or
// a YAML list (code.claude.com/docs/en/skills, frontmatter reference).
describe('doctor and allowed-tools', () => {
  it('does not flag a comma-separated allowed-tools value', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierward-allowed-tools-'));
    try {
      const skillDir = path.join(dir, '.claude', 'skills', 'custom-commas');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: custom-commas\ndescription: Test skill.\nallowed-tools: Read, Glob, Grep\n---\n\nBody.\n',
      );
      let out;
      try {
        out = execFileSync('node', [CLI, 'doctor', '--report'], { cwd: dir, encoding: 'utf8' });
      } catch (err) {
        out = err.stdout; // doctor exits 1 on a project with failing checks
      }
      const flagged = JSON.parse(out).checks.filter(
        (r) => r.status !== 'pass' && r.status !== 'skip' && /allowed-tools/i.test(r.label),
      );
      assert.deepEqual(flagged, []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// A forked skill runs in the background by default since Claude Code v2.1.218;
// the pipeline reads each skill's result in the turn that invoked it.
describe('shipped forked skills', () => {
  const roots = [
    path.join(PACKAGE_ROOT, 'templates'),
    path.join(PACKAGE_ROOT, '..', '..', 'plugin'),
  ];
  const skillFiles = roots.flatMap((root) =>
    fs.existsSync(root)
      ? fs
          .readdirSync(root, { recursive: true })
          .filter((rel) => path.basename(rel) === 'SKILL.md')
          .map((rel) => path.join(root, rel))
      : [],
  );

  it('finds the shipped skills', () => {
    assert.ok(skillFiles.length > 50, `found ${skillFiles.length}`);
  });

  it('every skill with context: fork sets background: false', () => {
    const forked = skillFiles.filter(
      (file) => parseSkillFile(fs.readFileSync(file, 'utf8')).fields.context === 'fork',
    );
    const missing = forked.filter(
      (file) => parseSkillFile(fs.readFileSync(file, 'utf8')).fields.background !== 'false',
    );
    assert.ok(forked.length > 50, `found ${forked.length} forked skills`);
    assert.deepEqual(
      missing.map((file) => path.relative(PACKAGE_ROOT, file)),
      [],
    );
  });

  // A forked skill ends before a subagent it launches returns, and the result
  // lands in the main conversation (P12a probes, Claude Code 2.1.296, interactive
  // and `-p`). So a forked skill does its work itself (DEC-53).
  const DELEGATION =
    /Launch [^.\n]*(sub)?agent|Explore (sub)?agent|spawn[^.\n]*subagent|subagent_type|run_in_background/i;

  it('no forked skill launches a subagent or grants itself the Agent tool', () => {
    const delegating = skillFiles
      .map((file) => ({ file, skill: parseSkillFile(fs.readFileSync(file, 'utf8')) }))
      .filter(({ skill }) => skill.fields.context === 'fork')
      .filter(
        ({ skill }) =>
          DELEGATION.test(skill.body) || /(^|\s)Agent(\s|$)/.test(skill.fields.allowedTools || ''),
      )
      .map(({ file }) => path.relative(PACKAGE_ROOT, file));
    assert.deepEqual(delegating, []);
  });

  it('pr-review runs in the main conversation and keeps its review subagent', () => {
    const prReview = skillFiles.filter((file) => file.includes(`${path.sep}pr-review${path.sep}`));
    assert.equal(prReview.length, 2, prReview.join(', '));
    for (const file of prReview) {
      const skill = parseSkillFile(fs.readFileSync(file, 'utf8'));
      // parseSkillFile reports an absent field as null
      assert.equal(skill.fields.context, null, file);
      assert.equal(skill.fields.background, null, file);
      assert.match(skill.body, /subagent_type: general-purpose/, file);
      assert.match(skill.fields.allowedTools || '', /(^|\s)Agent(\s|$)/, file);
    }
  });

  // Maintainer-only, not shipped, same rule (DEC-54): its quick mode needs the
  // result of a general-purpose subagent.
  it("the maintainer's external-review skill delegates, so it does not fork", () => {
    const file = path.join(
      PACKAGE_ROOT,
      '..',
      '..',
      '.claude',
      'skills',
      'external-review',
      'SKILL.md',
    );
    const skill = parseSkillFile(fs.readFileSync(file, 'utf8'));
    assert.match(skill.body, /subagent_type=general-purpose/);
    assert.equal(skill.fields.context, null);
  });

  it('the shipped guides no longer contradict each other on subagents', () => {
    const repo = path.join(PACKAGE_ROOT, '..', '..');
    const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
    assert.ok(!read('docs/operational-guide.md').includes('delegates grep-heavy scanning'));
    assert.ok(!read('docs/custom-skills.md').includes('In a test on Claude Code 2.1.295'));
    const copies = (name) =>
      roots.flatMap((root) =>
        fs.existsSync(root)
          ? fs
              .readdirSync(root, { recursive: true })
              .filter((rel) => path.basename(rel) === name)
              .map((rel) => path.join(root, rel))
          : [],
      );
    for (const file of copies('advanced-checks.md')) {
      assert.ok(!fs.readFileSync(file, 'utf8').includes('Known exceptions to rule 1'), file);
    }
    for (const file of copies('AGENT_PATTERN.md')) {
      assert.match(
        fs.readFileSync(file, 'utf8'),
        /`\/pr-review` does not declare `context: fork`/,
        file,
      );
    }
  });
});
