import chalk from 'chalk';
import { execSync } from 'child_process';
import { NATIVE_STACKS, WEB_STACKS } from '../scaffold/skill-registry.js';
import { printCloseMasthead } from './brand.js';

const TIER_LABELS = { 0: 'Discovery', S: 'Fast Lane', M: 'Standard', L: 'Full' };

export function printPlan(config) {
  const tier = (config.tier || 's').toUpperCase();
  const mode = config.mode || 'greenfield';

  console.log(chalk.bold('Project:') + ` ${config.projectName}`);
  console.log(chalk.bold('Mode:') + ` ${formatMode(mode)}`);
  console.log(chalk.bold('Tier:') + ` ${tier} - ${TIER_LABELS[tier] || tier}`);
  if (config.techStack) console.log(chalk.bold('Stack:') + ` ${config.techStack}`);

  // 3.3 - commands summary (only non-misleading values)
  const cmdLines = getCommandSummary(config);
  if (cmdLines.length > 0) {
    console.log();
    console.log(chalk.bold('Commands:'));
    cmdLines.forEach((l) => console.log(`  ${l}`));
  }

  console.log();
  console.log(chalk.bold('Files that will be created:'));
  getFilePlan(config).forEach((f) => console.log(`  ${chalk.dim('+')} ${f}`));

  // 3.1 - BUG-01: skills section for Tier S/M/L
  if (tier !== '0') {
    const { included, skipped } = getSkillsSummary(config);
    console.log();
    console.log(chalk.bold('Skills included:  ') + included.map((s) => chalk.cyan(s)).join('  '));
    if (skipped.length > 0) {
      console.log(
        chalk.bold('Skills skipped:   ') +
          skipped.map((s) => `${chalk.dim(s.name)} ${chalk.dim('(' + s.reason + ')')}`).join('  '),
      );
    }
  }

  if (mode === 'from-context') {
    console.log();
    console.log(chalk.bold('Context sources:'));
    (config.sourceRepos || []).forEach((r) => console.log(`  ${chalk.dim('→')} ${r.source}`));
    (config.sourceDocs || []).forEach((d) => console.log(`  ${chalk.dim('→')} ${d}`));
  }
}

export function printNextSteps(config, opts = {}) {
  const mode = config.mode || 'greenfield';
  const tierUpper = (config.tier || 's').toUpperCase();

  // Coherent frame: the same wordmark closes the experience, plus a one-line,
  // tier-aware summary of what the developer now holds.
  printCloseMasthead();
  console.log('  ' + tierBlurb(tierUpper));
  console.log();

  // 3.4 - adapt doctor command to execution context
  const doctorCmd = getDoctorCmd();
  // 3.2 - detect package manager for pre-commit
  const preCommitCmd = getPreCommitInstallCmd();

  if (mode === 'greenfield') {
    const tier = (config.tier || 's').toUpperCase();
    let step = 1;
    if (tier === 'M' || tier === 'L') {
      console.log(
        `  ${step++}. Read ` +
          chalk.cyan('.claude/FIRST_SESSION.md') +
          ' - pipeline map, STOP gates, and skill commands',
      );
    }
    console.log(
      `  ${step++}. Fill ` +
        chalk.cyan('CLAUDE.md') +
        ' placeholders + set test command in ' +
        chalk.cyan('.claude/settings.json'),
    );
    console.log(
      `  ${step}. ` + chalk.bold('Try it now') + ' - open ' + chalk.cyan('claude') + ' and say:',
    );
    console.log(
      '       ' + chalk.cyan('"Start a new block: <the first feature you want to build>"'),
    );
    console.log(
      chalk.dim('       A block is one feature, start to finish. Claude proposes a plan and'),
    );
    console.log(chalk.dim('       stops for your go-ahead before writing code.'));
    if (tier === 'S') {
      console.log(
        chalk.dim('       Tip: use a fix/ branch — the Fast Lane activates automatically.'),
      );
    }
  }

  if (mode === 'from-context') {
    console.log('  1. ' + chalk.cyan('cd ' + config.projectName));
    console.log('  2. Open Claude Code: ' + chalk.cyan('claude'));
    console.log(
      '  3. Claude will detect ' +
        chalk.cyan('CONTEXT_IMPORT.md') +
        ' and start the discovery pass automatically',
    );
    console.log('     It will read your source repos and docs, then populate CLAUDE.md and docs/');
    console.log('  4. Confirm the discovery summary and answer any gap questions');
    console.log('  5. Run ' + chalk.cyan(doctorCmd) + ' after discovery completes');
  }

  if (mode === 'in-place') {
    const { ranDoctor = false, ranPreCommit = false } = opts;

    console.log();
    console.log('  1. Open Claude Code in this directory:');
    console.log('       ' + chalk.cyan('claude'));

    console.log();
    console.log(
      '  2. ' + chalk.bold('Discovery pass') + chalk.dim(' - starts automatically on first open'),
    );
    console.log(
      '       Claude reads ' + chalk.cyan('CONTEXT_IMPORT.md') + ' - your project briefing file -',
    );
    console.log('       and scans your codebase. It generates CLAUDE.md, fills in docs/,');
    console.log('       and asks you about anything it could not infer from the code.');
    console.log(
      '       ' + chalk.dim("Takes 5–10 min. Confirm the output, then you're inside the pipeline."),
    );
    console.log();
    console.log(
      '       ' + chalk.dim('Tip: open CONTEXT_IMPORT.md before starting Claude and review'),
    );
    console.log('       ' + chalk.dim('     what it will ask Claude to analyze. Edit if needed.'));

    let step = 3;
    if (!ranDoctor) {
      console.log();
      console.log(`  ${step++}. After discovery completes:`);
      console.log('       ' + chalk.cyan(doctorCmd) + chalk.dim('  ← validates files and hooks'));
    }
    if (config.includePreCommit && !ranPreCommit) {
      console.log();
      console.log(`  ${step}. Activate secret scanning:`);
      console.log('       ' + chalk.cyan(preCommitCmd));
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// One-line, tier-aware summary of what the scaffold gave the developer.
function tierBlurb(tier) {
  const map = {
    0: 'Discovery (Tier 0) - a lightweight, guided setup to start building fast.',
    S: 'Fast Lane (Tier S) - a lightweight workflow for quick, low-risk changes.',
    M: 'Standard (Tier M) - a phased pipeline with STOP gates you approve, audit skills, and a commit gate.',
    L: 'Full (Tier L) - the complete phased pipeline for complex, team-scale work, audit skills, and a commit gate.',
  };
  return chalk.dim(map[tier] || map.S);
}

function formatMode(mode) {
  return (
    { greenfield: 'Greenfield', 'from-context': 'From context', 'in-place': 'In-place' }[mode] ||
    mode
  );
}

/**
 * 3.2 - Detect the right pre-commit install command for this machine.
 * macOS + Homebrew → brew; everything else → pip.
 */
function getPreCommitInstallCmd() {
  if (process.platform === 'darwin') {
    try {
      execSync('which brew', { stdio: 'pipe' });
      return 'brew install pre-commit && pre-commit install';
    } catch {
      /* brew not available */
    }
  }
  return 'pip install pre-commit && pre-commit install';
}

/**
 * 3.4 - Detect if the CLI is being run from its local source tree (e.g., during
 * development: `node packages/cli/src/index.js`) vs installed via npm/npx.
 * Returns the appropriate doctor command string.
 */
function getDoctorCmd() {
  const argv1 = process.argv[1] || '';
  const isLocal = argv1.endsWith('index.js') && !argv1.includes('node_modules');
  return isLocal ? `node ${argv1} doctor` : 'npx tierward doctor';
}

/**
 * 3.3 - Return command lines to display in the summary, skipping values that are
 * misleading defaults (e.g., "npm run dev" shown for a native/non-web stack).
 */
function getCommandSummary(config) {
  const lines = [];
  const isWeb = WEB_STACKS.includes(config.techStack);
  const isNative = NATIVE_STACKS.includes(config.techStack);

  if (config.testCommand) {
    lines.push(`${chalk.dim('Test:  ')} ${config.testCommand}`);
  }

  if (config.devCommand) {
    // Skip 'npm run dev' for non-web stacks - it's a wrong default, not a real setting
    const isWrongDefault = !isWeb && config.devCommand === 'npm run dev';
    if (!isWrongDefault) {
      const label = isNative ? chalk.dim('Launch:') : chalk.dim('Dev:   ');
      lines.push(`${label} ${config.devCommand}`);
    }
  }

  if (config.e2eCommand) {
    lines.push(`${chalk.dim('E2E:   ')} ${config.e2eCommand}`);
  }

  // Show audit model when it matters (Tier M/L + UI present)
  const tier = (config.tier || 's').toUpperCase();
  if ((tier === 'M' || tier === 'L') && config.hasFrontend !== false && config.auditModel) {
    lines.push(`${chalk.dim('Audit model:')} ${config.auditModel}`);
  }

  return lines;
}

/**
 * 3.1 - BUG-01: compute the skills included/skipped based on config flags.
 * Mirrors the logic in scaffold/index.js → pruneSkills().
 */
function getSkillsSummary(config) {
  const tier = (config.tier || 's').toUpperCase();

  // Tier S: fixed set, no pruning
  if (tier === 'S') {
    return { included: ['arch-audit', 'commit'], skipped: [] };
  }

  // Tier M / L: full set with conditional pruning
  const included = [
    'arch-audit',
    'skill-dev',
    'perf-audit',
    'commit',
    'security-audit',
    'test-audit',
  ];
  const skipped = [];

  if (config.hasApi !== false) {
    included.push('api-design');
  } else {
    skipped.push({ name: 'api-design', reason: 'no API layer' });
  }

  if (config.hasDatabase !== false) {
    included.push('skill-db', 'migration-audit');
  } else {
    skipped.push(
      { name: 'skill-db', reason: 'no database' },
      { name: 'migration-audit', reason: 'no database' },
    );
  }

  const isNative = NATIVE_STACKS.includes(config.techStack);

  if (config.hasFrontend !== false) {
    if (!isNative) included.push('responsive-audit');
    else skipped.push({ name: 'responsive-audit', reason: 'native UI' });
    included.push('visual-audit', 'ux-audit', 'accessibility-audit');
    if (config.hasDesignSystem !== false) {
      included.push('ui-audit');
    } else {
      skipped.push({ name: 'ui-audit', reason: 'no design system' });
    }
  } else {
    skipped.push(
      { name: 'responsive-audit', reason: 'no UI' },
      { name: 'visual-audit', reason: 'no UI' },
      { name: 'ux-audit', reason: 'no UI' },
      { name: 'ui-audit', reason: 'no UI' },
      { name: 'accessibility-audit', reason: 'no UI' },
    );
  }

  return { included, skipped };
}

function getFilePlan(config) {
  const tier = (config.tier || 's').toUpperCase();
  const mode = config.mode || 'greenfield';

  // Tier 0 is a minimal scaffold - communication governance only
  // (output-style.md), no pipeline or workflow rules.
  if (tier === '0') {
    return [
      'CLAUDE.md',
      'GETTING_STARTED.md',
      '.claude/settings.json',
      '.claude/rules/output-style.md',
      '.claude/session/  (directory)',
    ];
  }

  const base = [
    '.claude/settings.json',
    `.claude/rules/pipeline.md  (Tier ${tier})`,
    '.claude/rules/context-review.md',
    '.claude/rules/security.md',
    '.claude/rules/git.md',
    '.claude/session/  (directory)',
  ];

  // files-guide skipped for Tier S (reduced file count)
  if (tier !== 'S') {
    base.push('.claude/files-guide.md');
  }

  if (mode === 'greenfield') {
    base.unshift('CLAUDE.md');
    base.push('README.md');
    // Tier 0 returned early above; S/M/L greenfield generate the idea-based
    // discovery variant (see generateGreenfieldContextImport).
    base.push('CONTEXT_IMPORT.md  ← Claude reads this to turn your idea into a plan');
  } else {
    base.push('CONTEXT_IMPORT.md  ← Claude reads this and fills in the rest');
  }

  if (mode === 'greenfield' && (tier === 'M' || tier === 'L')) {
    base.push('MEMORY.md');
  }

  if (tier === 'M' || tier === 'L') {
    if (mode === 'greenfield') {
      base.push(
        '.claude/FIRST_SESSION.md  ← start here',
        'docs/requirements.md',
        'docs/implementation-checklist.md',
        'docs/refactoring-backlog.md',
      );
    } else {
      base.push('docs/  (populated by Claude during discovery)');
    }
    base.push('docs/adr/template.md');
    const isNative = NATIVE_STACKS.includes(config.techStack);
    if (config.hasFrontend !== false && !isNative) {
      base.push('docs/sitemap.md');
    }
    if (config.hasDatabase !== false) {
      base.push('docs/db-map.md');
    }
  }

  if (config.includeGithub !== false) {
    base.push('.github/PULL_REQUEST_TEMPLATE.md', '.github/CODEOWNERS');
  }

  if (config.includePreCommit !== false) {
    base.push('.pre-commit-config.yaml');
  }

  if (mode === 'from-context') {
    base.push('.claude/context/  (cloned repos + docs)');
  }

  return base;
}

/**
 * Print a low-friction star CTA after a successful scaffold.
 * Only shown once, at the very end of the init output, after Next steps and Docs.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.doctorPassed] - When true (in-place flow with inline doctor),
 *   we know the scaffold is healthy. When undefined/false (greenfield/discovery),
 *   we show it anyway since the scaffold succeeded.
 */
export function printStarCta({ doctorPassed } = {}) {
  if (doctorPassed === false) return; // doctor ran and reported issues — skip
  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.dim('If Tierward is useful, a ★ on GitHub helps others find it.'));
  console.log(chalk.dim('  https://github.com/marcoguillermaz/Tierward'));
}
