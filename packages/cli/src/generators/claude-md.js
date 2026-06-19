import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { interpolate } from '../scaffold/index.js';
import { getActiveSkills, NATIVE_STACKS } from '../scaffold/skill-registry.js';
import { STACK_COMMANDS } from '../utils/stack-commands.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

/**
 * Generate CLAUDE.md from the tier template, applying wizard answers.
 * Single authoritative writer - scaffold/index.js does NOT copy CLAUDE.md.
 *
 * Pipeline: raw template → interpolate() (all placeholders) → command block
 *           → rule imports → active skills → conditional stripping → write
 */
export async function generateClaudeMd(config, targetDir) {
  const tier = (config.tier || 's').toLowerCase();
  const templatePath = path.join(TEMPLATES_DIR, `tier-${tier}`, 'CLAUDE.md');

  let content;
  if (await fs.pathExists(templatePath)) {
    content = await fs.readFile(templatePath, 'utf8');
  } else {
    content = getMinimalTemplate();
  }

  // Resolve all template placeholders (stack labels, commands, booleans, conditionals)
  content = interpolate(content, config);

  // Overwrite the command block with formatted version (adds inline comments)
  const commands = buildCommandsBlock(config);
  content = content.replace(/```bash[\s\S]*?```/, commands);

  // Inject rule @-imports and Active Skills section for tier S/M/L
  if (tier === 's' || tier === 'm' || tier === 'l') {
    content = injectRuleImports(content);
    content = injectActiveSkills(content, config);
  } else if (tier === '0') {
    // Tier 0 gets only the communication-governance import. The standards docs
    // (@docs/*-standards.md) are not scaffolded for tier 0 - importing them
    // would dangle - and there is no Active Skills section.
    content = injectRuleImports(content, ['@.claude/rules/output-style.md']);
  }

  // Strip web-centric convention for projects without API routes
  if (config.hasApi === false) {
    content = content.replace(/^- Every API route:.*\n/m, '');
  }

  // Strip irrelevant Tech Stack placeholders for native stacks
  if (NATIVE_STACKS.includes(config.techStack)) {
    content = content.replace(/^- \*\*Auth\*\*:.*\n/m, '');
    content = content.replace(/^- \*\*Storage\*\*:.*\n/m, '');
    content = content.replace(/^- \*\*Email\*\*:.*\n/m, '');
    content = content.replace(/^- \*\*Deploy\*\*:.*$/m, '- **Deploy**: _native distribution_');
  }

  // Replace Environment section for native stacks (no .env, no staging/production URLs)
  if (NATIVE_STACKS.includes(config.techStack)) {
    content = content.replace(
      /## Environment[\s\S]*$/,
      `## Environment\n- **Distribution**: _native (DMG / TestFlight / App Store)_\n- **Signing**: _configure in Xcode Signing & Capabilities_\n`,
    );
  }

  // Strip Database placeholder if hasDatabase=false
  if (config.hasDatabase === false) {
    content = content.replace(/^- \*\*Database\*\*:.*\n/m, '');
  }

  // Add design system reference to Coding Conventions when specified
  if (
    config.hasDesignSystem &&
    config.designSystemName &&
    config.designSystemName !== 'component library'
  ) {
    content = content.replace(
      /## Coding Conventions/,
      `## Coding Conventions\n- **Design guideline**: ${config.designSystemName}. UI decisions should follow this reference.`,
    );
  }

  // Strip sections containing only placeholder content to save context tokens
  content = stripUnfilledSections(content);

  await fs.writeFile(path.join(targetDir, 'CLAUDE.md'), content);
}

function buildCommandsBlock(config) {
  const ncd = STACK_COMMANDS[config.techStack] || {};
  // Swift xcodebuild commands need -scheme to target the correct scheme
  const swiftScheme =
    config.techStack === 'swift' && config.projectName ? ` -scheme ${config.projectName}` : '';
  const install = config.installCommand || ncd.install || 'npm install';
  const dev =
    config.devCommand !== null && config.devCommand !== undefined && config.devCommand !== ''
      ? config.devCommand
      : config.devCommand === ''
        ? ''
        : ncd.dev || 'npm run dev';
  const build =
    config.buildCommand || (ncd.build ? ncd.build + swiftScheme : '') || 'npm run build';
  const test = config.testCommand || (ncd.test ? ncd.test + swiftScheme : '') || 'npm test';
  const typeCheck = config.typeCheckCommand || ncd.typeCheck || '';
  const migration = config.migrationCommand || '';
  const e2e = config.e2eCommand || '';

  const lines = ['```bash'];
  if (install) lines.push(`${install}     # install dependencies`);
  if (dev) lines.push(`${dev}          # start dev server`);
  if (build) lines.push(`${build}       # production build`);
  if (test) lines.push(`${test}         # run tests`);
  if (typeCheck) lines.push(`${typeCheck}  # type check`);
  if (migration && migration !== '# not configured') lines.push(`${migration}  # run migrations`);
  if (e2e && e2e !== '# not configured') lines.push(`${e2e}  # end-to-end tests`);
  lines.push('```');
  return lines.join('\n');
}

/**
 * Append rule @-imports after the first H1 heading. Defaults to the three
 * shared files (S/M/L); callers pass a narrower list for leaner tiers
 * (tier 0 imports only output-style.md). Idempotent - skips if already present.
 */
function injectRuleImports(
  content,
  imports = [
    '@.claude/rules/output-style.md',
    '@docs/claudemd-standards.md',
    '@docs/pipeline-standards.md',
  ],
) {
  // If any import already present, skip (idempotent)
  if (imports.every((i) => content.includes(i))) return content;

  const importBlock = '\n' + imports.join('\n') + '\n';
  // Insert after the first heading line (# ...)
  return content.replace(/^(# .+)$/m, `$1${importBlock}`);
}

/**
 * Append an Active Skills section listing which skills are installed,
 * based on feature flags from the wizard.
 */
function injectActiveSkills(content, config) {
  const active = getActiveSkills(config);

  const section = `\n## Active Skills\n${active.map((s) => `- \`/${s}\``).join('\n')}\n`;

  // Append before Environment section, or at end of file
  if (content.includes('\n## Environment')) {
    return content.replace('\n## Environment', section + '\n## Environment');
  }
  return content + section;
}

/**
 * Remove sections that contain only placeholder content (bracket patterns,
 * HTML comments, empty lines). These waste context tokens every session
 * until the user fills them in. Stripped sections are documented in
 * FIRST_SESSION.md so users know they exist.
 */
function stripUnfilledSections(content) {
  const sectionsToStrip = new Set([
    'RBAC / Roles',
    'Key Workflows',
    'Navigation by Role',
    'Known Patterns',
  ]);

  const lines = content.split('\n');
  const sections = [];
  let current = { heading: null, lines: [] };

  for (const line of lines) {
    const match = line.match(/^## (.+)/);
    if (match) {
      sections.push(current);
      current = { heading: match[1].trim(), lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);

  const kept = sections.filter((s) => !s.heading || !sectionsToStrip.has(s.heading));

  // Rejoin and collapse runs of 3+ blank lines to 2
  return kept
    .map((s) => s.lines.join('\n'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

// Exported for unit testing only - not part of the public API
export const _testHelpers = {
  buildCommandsBlock,
  injectRuleImports,
  injectActiveSkills,
  stripUnfilledSections,
};

function getMinimalTemplate() {
  return `# [PROJECT_NAME] - Project Context

## Overview
[One paragraph: what the product does, who uses it, what problem it solves.]

## Tech Stack
- **Stack**: [TECH_STACK_SUMMARY]

## Key Commands
\`\`\`bash
[INSTALL_COMMAND]
[DEV_COMMAND]
[BUILD_COMMAND]
[TEST_COMMAND]
[TYPE_CHECK_COMMAND]
\`\`\`

## Coding Conventions
- [Add non-obvious conventions here]

## Known Patterns
<!-- Add non-obvious gotchas here as you discover them. -->
`;
}
