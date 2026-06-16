'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCcUri, skillPrompt, parseSkillHeader } = require('../dist/ccBridge.js');

test('skillPrompt prefixes the skill name with a slash', () => {
  assert.equal(skillPrompt('arch-audit'), '/arch-audit');
});

test('buildCcUri targets the Claude Code open handler with an encoded prompt', () => {
  assert.equal(
    buildCcUri('/arch-audit'),
    'vscode://anthropic.claude-code/open?prompt=%2Farch-audit',
  );
});

test('buildCcUri encodes spaces and reserved characters', () => {
  const uri = buildCcUri('/skill-db target:table users');
  assert.match(uri, /^vscode:\/\/anthropic\.claude-code\/open\?prompt=/);
  assert.ok(!uri.includes(' '), 'spaces must be percent-encoded');
  assert.equal(decodeURIComponent(uri.split('prompt=')[1]), '/skill-db target:table users');
});

test('parseSkillHeader reads name and a true user-invocable flag', () => {
  const header = parseSkillHeader(
    '---\nname: commit\ndescription: x\nuser-invocable: true\nmodel: sonnet\n---\nbody\n',
  );
  assert.equal(header.name, 'commit');
  assert.equal(header.userInvocable, true);
});

test('parseSkillHeader treats a false flag as not invocable', () => {
  const header = parseSkillHeader('---\nname: internal\nuser-invocable: false\n---\n');
  assert.equal(header.name, 'internal');
  assert.equal(header.userInvocable, false);
});

test('parseSkillHeader defaults user-invocable to false when absent', () => {
  const header = parseSkillHeader('---\nname: bare\ndescription: x\n---\n');
  assert.equal(header.name, 'bare');
  assert.equal(header.userInvocable, false);
});

test('parseSkillHeader returns null name and false when there is no frontmatter', () => {
  assert.deepEqual(parseSkillHeader('# just a heading\n'), { name: null, userInvocable: false });
});
