import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { generateClaudeMd, _testHelpers } from '../../src/generators/claude-md.js';

const { buildCommandsBlock, injectRuleImports, injectActiveSkills, stripUnfilledSections } =
  _testHelpers;

// ---------------------------------------------------------------------------
// buildCommandsBlock()
// ---------------------------------------------------------------------------

describe('buildCommandsBlock', () => {
  it('uses native commands for swift', () => {
    const block = buildCommandsBlock({ techStack: 'swift' });
    assert.ok(block.includes('xcodebuild build'));
    assert.ok(block.includes('xcodebuild test'));
    assert.ok(block.includes('swift run'));
    assert.ok(block.includes('# no install step'));
  });

  it('uses JS defaults for node-ts', () => {
    const block = buildCommandsBlock({ techStack: 'node-ts' });
    assert.ok(block.includes('npm install'));
    assert.ok(block.includes('npm run dev'));
    assert.ok(block.includes('npm run build'));
    assert.ok(block.includes('npm test'));
  });

  it('user override takes precedence over native default', () => {
    const block = buildCommandsBlock({ techStack: 'swift', testCommand: 'pytest' });
    assert.ok(block.includes('pytest'));
    assert.ok(!block.includes('xcodebuild test'));
  });

  it('omits typeCheck line when empty', () => {
    const block = buildCommandsBlock({ techStack: 'swift' });
    assert.ok(!block.includes('# type check'));
  });

  it('includes typeCheck when provided', () => {
    const block = buildCommandsBlock({
      techStack: 'node-ts',
      typeCheckCommand: 'npx tsc --noEmit',
    });
    assert.ok(block.includes('npx tsc --noEmit'));
    assert.ok(block.includes('# type check'));
  });

  it('omits migration when "# not configured"', () => {
    const block = buildCommandsBlock({
      techStack: 'node-ts',
      migrationCommand: '# not configured',
    });
    assert.ok(!block.includes('# run migrations'));
  });

  it('includes migration when set to real command', () => {
    const block = buildCommandsBlock({
      techStack: 'node-ts',
      migrationCommand: 'npx prisma migrate deploy',
    });
    assert.ok(block.includes('npx prisma migrate deploy'));
    assert.ok(block.includes('# run migrations'));
  });

  it('omits e2e when "# not configured"', () => {
    const block = buildCommandsBlock({ techStack: 'node-ts', e2eCommand: '# not configured' });
    assert.ok(!block.includes('# end-to-end tests'));
  });

  it('includes e2e when set to real command', () => {
    const block = buildCommandsBlock({ techStack: 'node-ts', e2eCommand: 'npx playwright test' });
    assert.ok(block.includes('npx playwright test'));
    assert.ok(block.includes('# end-to-end tests'));
  });

  it('wraps output in code fences', () => {
    const block = buildCommandsBlock({ techStack: 'node-ts' });
    assert.ok(block.startsWith('```bash'));
    assert.ok(block.endsWith('```'));
  });
});

// ---------------------------------------------------------------------------
// injectRuleImports()
// ---------------------------------------------------------------------------

describe('injectRuleImports', () => {
  it('inserts imports after first # heading', () => {
    const input = '# My Project\n\n## Overview\nSome text';
    const result = injectRuleImports(input);
    assert.ok(result.includes('@.claude/rules/output-style.md'));
    assert.ok(result.includes('@docs/claudemd-standards.md'));
    assert.ok(result.includes('@docs/pipeline-standards.md'));
    // imports appear between # heading and ## Overview
    const headingIdx = result.indexOf('# My Project');
    const importIdx = result.indexOf('@.claude/rules/output-style.md');
    const overviewIdx = result.indexOf('## Overview');
    assert.ok(importIdx > headingIdx);
    assert.ok(importIdx < overviewIdx);
  });

  it('is idempotent - skips if all imports present', () => {
    const input =
      '# My Project\n@.claude/rules/output-style.md\n@docs/claudemd-standards.md\n@docs/pipeline-standards.md\n\n## Overview';
    const result = injectRuleImports(input);
    // count occurrences - should be exactly 1 each
    const count = (str, sub) => str.split(sub).length - 1;
    assert.equal(count(result, '@.claude/rules/output-style.md'), 1);
    assert.equal(count(result, '@docs/claudemd-standards.md'), 1);
  });
});

// ---------------------------------------------------------------------------
// injectActiveSkills()
// ---------------------------------------------------------------------------

describe('injectActiveSkills', () => {
  const base = '# Project\n\n## Overview\nText';

  it('tier S includes base skills + security-audit by default', () => {
    const result = injectActiveSkills(base, { tier: 's' });
    assert.ok(result.includes('## Active Skills'));
    assert.ok(result.includes('`/arch-audit`'));
    assert.ok(result.includes('`/skill-dev`'));
    assert.ok(result.includes('`/perf-audit`'));
    assert.ok(result.includes('`/simplify`'));
    assert.ok(result.includes('`/commit`'));
    assert.ok(result.includes('`/security-audit`'));
  });

  it('tier S with hasApi=false keeps security-audit (stack-agnostic)', () => {
    const result = injectActiveSkills(base, { tier: 's', hasApi: false });
    assert.ok(result.includes('`/security-audit`'));
    assert.ok(result.includes('`/arch-audit`'));
  });

  it('tier M all-true includes full skill set', () => {
    const result = injectActiveSkills(base, {
      tier: 'm',
      hasApi: true,
      hasDatabase: true,
      hasFrontend: true,
      hasDesignSystem: true,
    });
    assert.ok(result.includes('`/api-design`'));
    assert.ok(result.includes('`/security-audit`'));
    assert.ok(result.includes('`/skill-db`'));
    assert.ok(result.includes('`/responsive-audit`'));
    assert.ok(result.includes('`/visual-audit`'));
    assert.ok(result.includes('`/ux-audit`'));
    assert.ok(result.includes('`/ui-audit`'));
  });

  it('tier M hasApi=false excludes api-design but keeps security-audit', () => {
    const result = injectActiveSkills(base, { tier: 'm', hasApi: false });
    assert.ok(!result.includes('`/api-design`'));
    assert.ok(result.includes('`/security-audit`'));
  });

  it('tier M hasFrontend=false excludes all frontend skills', () => {
    const result = injectActiveSkills(base, { tier: 'm', hasFrontend: false });
    assert.ok(!result.includes('`/responsive-audit`'));
    assert.ok(!result.includes('`/visual-audit`'));
    assert.ok(!result.includes('`/ux-audit`'));
    assert.ok(!result.includes('`/ui-audit`'));
  });

  it('tier M hasDesignSystem=false excludes ui-audit but keeps other frontend skills', () => {
    const result = injectActiveSkills(base, {
      tier: 'm',
      hasFrontend: true,
      hasDesignSystem: false,
    });
    assert.ok(!result.includes('`/ui-audit`'));
    assert.ok(result.includes('`/visual-audit`'));
    assert.ok(result.includes('`/ux-audit`'));
  });

  it('inserts before ## Environment if present', () => {
    const withEnv = '# Project\n\n## Overview\nText\n\n## Environment\nNode 22';
    const result = injectActiveSkills(withEnv, { tier: 's' });
    const skillsIdx = result.indexOf('## Active Skills');
    const envIdx = result.indexOf('## Environment');
    assert.ok(skillsIdx < envIdx);
  });

  it('appends at end when no ## Environment', () => {
    const result = injectActiveSkills(base, { tier: 's' });
    assert.ok(result.endsWith('\n'));
    assert.ok(result.includes('## Active Skills'));
  });
});

// ---------------------------------------------------------------------------
// stripUnfilledSections()
// ---------------------------------------------------------------------------

describe('stripUnfilledSections', () => {
  it('removes RBAC / Roles section', () => {
    const input = '## Overview\nReal content\n\n## RBAC / Roles\n[placeholder]\n\n## Next\nMore';
    const result = stripUnfilledSections(input);
    assert.ok(!result.includes('RBAC / Roles'));
    assert.ok(result.includes('## Overview'));
    assert.ok(result.includes('## Next'));
  });

  it('removes Key Workflows section', () => {
    const input = '## Overview\nReal content\n\n## Key Workflows\n[placeholder]\n\n## Next\nMore';
    const result = stripUnfilledSections(input);
    assert.ok(!result.includes('Key Workflows'));
  });

  it('removes Navigation by Role section', () => {
    const input =
      '## Overview\nReal content\n\n## Navigation by Role\n[placeholder]\n\n## Next\nMore';
    const result = stripUnfilledSections(input);
    assert.ok(!result.includes('Navigation by Role'));
  });

  it('removes Known Patterns section', () => {
    const input =
      '## Overview\nReal content\n\n## Known Patterns\n<!-- placeholder -->\n\n## Next\nMore';
    const result = stripUnfilledSections(input);
    assert.ok(!result.includes('Known Patterns'));
  });

  it('preserves sections not in strip list', () => {
    const input =
      '## Overview\nReal content\n\n## RBAC / Roles\n[placeholder]\n\n## Coding Conventions\nReal rules';
    const result = stripUnfilledSections(input);
    assert.ok(result.includes('## Coding Conventions'));
    assert.ok(result.includes('Real rules'));
  });

  it('collapses 3+ blank lines to 2', () => {
    const input = '## Overview\nContent\n\n\n\n\n## Next\nMore';
    const result = stripUnfilledSections(input);
    assert.ok(!result.includes('\n\n\n'));
  });
});

// ---------------------------------------------------------------------------
// generateClaudeMd() - end-to-end smoke test
// ---------------------------------------------------------------------------

describe('generateClaudeMd - end-to-end', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tierward-claudemd-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('produces CLAUDE.md with no unresolved placeholders for node-ts tier-s', async () => {
    await generateClaudeMd(
      {
        tier: 's',
        techStack: 'node-ts',
        projectName: 'TestProject',
        testCommand: 'npm test',
      },
      tmpDir,
    );
    const content = await fs.readFile(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    assert.ok(content.includes('TestProject'));
    assert.ok(content.includes('TypeScript')); // [LANGUAGE_VALUE] resolved
    // No unresolved [PLACEHOLDER] markers (allow [text] in prose, check for [UPPER_CASE])
    const unresolvedPlaceholders = content.match(/\[[A-Z][A-Z_]+\]/g) || [];
    assert.equal(
      unresolvedPlaceholders.length,
      0,
      `Unresolved placeholders: ${unresolvedPlaceholders.join(', ')}`,
    );
  });

  it('produces CLAUDE.md with native commands for swift tier-m', async () => {
    await generateClaudeMd(
      {
        tier: 'm',
        techStack: 'swift',
        projectName: 'SwiftApp',
        hasApi: false,
        hasFrontend: true,
        hasDatabase: false,
      },
      tmpDir,
    );
    const content = await fs.readFile(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    assert.ok(content.includes('SwiftApp'));
    assert.ok(content.includes('xcodebuild'));
    assert.ok(content.includes('## Active Skills'));
    assert.ok(content.includes('@.claude/rules/output-style.md'));
    // native stack stripping: no Auth/Storage/Email lines
    assert.ok(!content.match(/^- \*\*Auth\*\*:/m));
    assert.ok(!content.match(/^- \*\*Storage\*\*:/m));
    // No unresolved placeholders
    const unresolved = content.match(/\[[A-Z][A-Z_]+\]/g) || [];
    assert.equal(unresolved.length, 0, `Unresolved: ${unresolved.join(', ')}`);
  });

  it('strips API convention line when hasApi=false', async () => {
    await generateClaudeMd(
      {
        tier: 's',
        techStack: 'node-ts',
        projectName: 'NoAPI',
        hasApi: false,
      },
      tmpDir,
    );
    const content = await fs.readFile(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    assert.ok(!content.match(/^- Every API route:/m));
  });
});
