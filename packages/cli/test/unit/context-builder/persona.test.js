import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSONAS,
  PERSONA_OPTIONS,
  routePersona,
  askPersona,
} from '../../../src/context-builder/persona.js';
import { runDevInterview } from '../../../src/context-builder/interview/dev-flow.js';
import { validateContextContent } from '../../../src/utils/validate-context.js';
import { serializeContext } from '../../../src/context-builder/writer.js';

describe('PERSONA_OPTIONS', () => {
  it('exposes exactly 5 options', () => {
    assert.equal(PERSONA_OPTIONS.length, 5);
  });

  it('includes developer, pm, techlead, founder, other', () => {
    const values = PERSONA_OPTIONS.map((o) => o.value).sort();
    assert.deepEqual(values, ['developer', 'founder', 'other', 'pm', 'techlead']);
  });
});

describe('routePersona', () => {
  it('routes developer → dev', () => {
    assert.equal(routePersona(PERSONAS.DEVELOPER), 'dev');
  });

  it('routes techlead → dev', () => {
    assert.equal(routePersona(PERSONAS.TECHLEAD), 'dev');
  });

  it('routes pm → pm', () => {
    assert.equal(routePersona(PERSONAS.PM), 'pm');
  });

  it('routes founder → pm', () => {
    assert.equal(routePersona(PERSONAS.FOUNDER), 'pm');
  });

  it('routes other → pm', () => {
    assert.equal(routePersona(PERSONAS.OTHER), 'pm');
  });

  it('unknown persona defaults to pm (safe)', () => {
    assert.equal(routePersona('unknown'), 'pm');
  });
});

describe('askPersona', () => {
  it('returns prefilled value without inquirer', async () => {
    const r = await askPersona({ prefilled: 'developer' });
    assert.equal(r, 'developer');
  });
});

describe('runDevInterview — smoke', () => {
  it('produces a valid CONTEXT.md for greenfield (no body prose required)', async () => {
    const { frontmatter, body } = await runDevInterview({
      mode: 'greenfield',
      prefilledAnswers: {
        familiarity: 'experienced',
        projectName: 'dev-smoke',
        description: 'A dev smoke test',
        techStack: 'node-ts',
        teamSize: 'solo',
        workScope: 'bugfix',
        tier: 's',
        testCommand: 'npx vitest run',
        typeCheckCommand: 'npx tsc --noEmit',
        devCommand: 'npm run dev',
        includePreCommit: true,
        includeGithub: false,
      },
    });
    const out = serializeContext(frontmatter, body);
    const result = validateContextContent(out);
    assert.equal(result.valid, true, `errors: ${JSON.stringify(result.errors)}`);
  });
});
