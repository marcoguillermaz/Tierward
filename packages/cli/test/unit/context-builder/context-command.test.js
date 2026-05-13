import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { contextCommand } from '../../../src/commands/context.js';
import { validateContextFile } from '../../../src/utils/validate-context.js';

function silentConsole(fn) {
  const orig = { log: console.log, error: console.error, warn: console.warn };
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  return Promise.resolve(fn()).finally(() => {
    Object.assign(console, orig);
  });
}

const baseAnswers = {
  familiarity: 'experienced',
  projectName: 'test-app',
  description: 'A small test project',
  techStack: 'node-ts',
  teamSize: 'solo',
  workScope: 'bugfix',
  tier: 's',
  tierRationale: 'Solo dev, ≤3 file changes per task',
  installCommand: 'npm install',
  testCommand: 'npx vitest run',
  typeCheckCommand: 'npx tsc --noEmit',
  devCommand: 'npm run dev',
  includePreCommit: true,
  includeGithub: false,
  bodyWhatBuilding: '',
  bodyConstraints: '',
  bodyOpenQuestions: '',
};

describe('contextCommand — greenfield via PM persona', () => {
  it('writes a valid CONTEXT.md in an empty cwd', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-ctx-gf-'));
    try {
      await silentConsole(() =>
        contextCommand({
          cwd: tmpDir,
          persona: 'pm',
          silent: true,
          prefilledAnswers: baseAnswers,
        }),
      );
      const result = validateContextFile(path.join(tmpDir, 'CONTEXT.md'));
      assert.equal(result.valid, true, `errors: ${JSON.stringify(result.errors)}`);
      assert.equal(result.data.project.mode, 'greenfield');
      assert.equal(result.data.project.name, 'test-app');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('contextCommand — greenfield via developer persona (dev stub)', () => {
  it('falls back to PM flow and writes valid CONTEXT.md', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-ctx-dev-'));
    try {
      await silentConsole(() =>
        contextCommand({
          cwd: tmpDir,
          persona: 'developer',
          silent: true,
          prefilledAnswers: baseAnswers,
        }),
      );
      const result = validateContextFile(path.join(tmpDir, 'CONTEXT.md'));
      assert.equal(result.valid, true, `errors: ${JSON.stringify(result.errors)}`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('contextCommand — in-place via inference (skipLlm)', () => {
  it('runs algo inference and PM-prefilled review and writes valid CONTEXT.md', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-ctx-ip-'));
    try {
      // Create a minimal Node project so detectMode returns "in-place"
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'ip-test',
          scripts: { test: 'npm test', dev: 'node .' },
        }),
      );

      // Phase 3 review: confirm everything algo detected
      const prefilledReviewAnswers = [
        { field: 'project.name', action: 'confirm' },
        { field: 'stack.primary', action: 'confirm' },
        { field: 'commands.install', action: 'confirm' },
        { field: 'commands.test', action: 'confirm' },
        { field: 'commands.dev', action: 'confirm' },
        { field: 'tier.selected', action: 'confirm' },
        { field: 'scaffold_options.include_pre_commit', action: 'confirm' },
        { field: 'scaffold_options.include_github', action: 'confirm' },
        {
          field: 'project.description',
          action: 'edit',
          value: 'A small in-place test project',
        },
        {
          field: 'tier.rationale',
          action: 'edit',
          value: 'Solo dev, simple bugfixes',
        },
      ];

      await silentConsole(() =>
        contextCommand({
          cwd: tmpDir,
          persona: 'pm',
          silent: true,
          skipLlm: true,
          prefilledReviewAnswers,
          prefilledProse: {
            what_building: 'A small test project for in-place mode',
            operational_constraints: 'Sandboxed test environment, no production data',
            open_questions: 'None for now',
          },
        }),
      );

      const result = validateContextFile(path.join(tmpDir, 'CONTEXT.md'));
      assert.equal(result.valid, true, `errors: ${JSON.stringify(result.errors)}`);
      assert.equal(result.data.project.mode, 'in-place');
      assert.equal(result.data.project.name, 'ip-test');
      assert.ok(result.data.inference);
      assert.ok(result.data.inference.source_files.includes('package.json'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('populates body with prefilledProse (in-place mode, fix verification)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdk-ctx-body-'));
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'body-test', scripts: { test: 'npm test' } }),
      );
      await silentConsole(() =>
        contextCommand({
          cwd: tmpDir,
          persona: 'pm',
          silent: true,
          skipLlm: true,
          prefilledReviewAnswers: [
            { field: 'project.description', action: 'edit', value: 'A body-test project' },
            { field: 'tier.rationale', action: 'edit', value: 'small scope' },
            { field: 'project.name', action: 'confirm' },
            { field: 'stack.primary', action: 'confirm' },
            { field: 'commands.install', action: 'confirm' },
            { field: 'commands.test', action: 'confirm' },
            { field: 'tier.selected', action: 'confirm' },
            { field: 'scaffold_options.include_pre_commit', action: 'confirm' },
            { field: 'scaffold_options.include_github', action: 'confirm' },
          ],
          prefilledProse: {
            what_building: 'A backend service that tracks tasks for a small team',
            operational_constraints: '2-week iteration cycle, no PII handling',
            open_questions: 'Hosting platform still TBD',
          },
        }),
      );
      const md = fs.readFileSync(path.join(tmpDir, 'CONTEXT.md'), 'utf8');
      assert.ok(
        md.includes('A backend service that tracks tasks for a small team'),
        'body should contain what_building prose',
      );
      assert.ok(md.includes('2-week iteration cycle'), 'body should contain constraints');
      assert.ok(md.includes('Hosting platform still TBD'), 'body should contain open questions');
      assert.ok(!md.includes('[Deadlines'), 'placeholder should NOT remain when populated');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
