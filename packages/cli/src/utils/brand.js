import chalk from 'chalk';

// Single source of Tierward's brand voice. Welcome (init.js), closing
// (print-plan.js), and the READMEs all draw from here so the three surfaces
// never drift. Keep the positioning honest: governed phased process + skills,
// not "magic multi-agent proactivity" (the test phase showed the model + the
// auto-loaded pipeline already do the informational work; Tierward's value is
// the mechanical structure and the knowledge the model can't invent).

const TEAL = '#16E0BD';
export const teal = (s) => chalk.hex(TEAL)(s);

// The compact terminal wordmark (Variant 3): teal hex glyph + bold name.
export const WORDMARK = chalk.hex(TEAL).bold('⬢ TIERWARD');

// 5-second hero line — what a stranger reads first (also the README hero).
export const TAGLINE = 'Build real software with Claude Code — with a process, not vibes.';

// Canonical positioning statement (single-source). Used in the READMEs and the
// docs site so all surfaces say the same thing.
export const POSITIONING =
  'A development framework that gives Claude Code a governed, phased process — ' +
  'so you build real software consistently and reviewably, from day one.';

// Masthead for the wizard OPEN: wordmark + hero + one intro paragraph + a light
// expectation-setter, then the prompts follow.
export function printWelcome() {
  console.log();
  console.log(`  ${WORDMARK}  ${chalk.dim(TAGLINE)}`);
  console.log();
  console.log(
    chalk.dim('  Tierward sets up your project so Claude works to one consistent, reviewable'),
  );
  console.log(
    chalk.dim('  method from day one: a phased workflow, STOP gates you approve, and audit'),
  );
  console.log(chalk.dim('  skills ready to run.'));
  console.log();
  console.log(chalk.dim('  A few quick questions (~2 min). You can edit everything after.'));
  console.log();
}

// Compact masthead for the wizard CLOSE — one line, so it never crowds the
// post-scaffold output (the "coherent frame" without the bulk).
export function printCloseMasthead() {
  console.log();
  console.log(`  ${WORDMARK} ${chalk.dim("— you're set up.")}`);
  console.log();
}
