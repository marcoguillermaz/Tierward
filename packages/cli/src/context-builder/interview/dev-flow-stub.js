/**
 * Dev flow stub — v1.
 *
 * Real developer-optimized interview is deferred to v1.1 (pending PM-driven
 * research on the right questions for Software Engineers and Tech Leads,
 * see memory: project_context_builder_decisions.md decision D).
 *
 * In v1, the dev branch shows a transition message and falls back to the
 * PM flow. This permits releasing v1 immediately and collecting
 * persona-distribution telemetry to size the future research.
 */
import chalk from 'chalk';
import { runPmInterview } from './pm-flow.js';

export const STUB_MESSAGE =
  "Developer-optimized interview is in design (v1.1). For now we'll use the standard interview — press Enter to accept defaults at every step.";

/**
 * Run the dev flow stub: print a transition message, then fall through
 * to the PM interview.
 *
 * @param {object} [options] - Same options as runPmInterview, plus:
 * @param {boolean} [options.silent] - Suppress the stub message (tests)
 */
export async function runDevFlowStub(options = {}) {
  if (!options.silent) {
    console.log();
    console.log(chalk.yellow(STUB_MESSAGE));
    console.log();
  }
  return runPmInterview(options);
}
