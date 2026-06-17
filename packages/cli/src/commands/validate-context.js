/**
 * `validate-context` sub-command — checks a CONTEXT.md against schema v1.
 *
 * Exit codes:
 *   0 — file passes 16 MUST PASS + 6 inter-field constraints
 *   1 — any failure (missing file, YAML error, schema violation)
 *
 * Modes:
 *   default — human-readable output (chalk-colored, one error per line)
 *   --json  — machine-readable JSON ({ valid, errors, data, body })
 *
 * Use cases (v1.1):
 *   - CI gating: `npx tierward validate-context && build`
 *   - Hand-edited CONTEXT.md verified before commit
 *   - Reproducing the same MUST PASS check that `context` runs after write
 */
import path from 'node:path';
import chalk from 'chalk';
import { validateContextFile } from '../utils/validate-context.js';

/**
 * Build a stdout/stderr-bound output object for a validation result.
 * Pure function — testable without touching process state.
 *
 * @param {string} filePath - Absolute path to the validated file
 * @param {object} result - Output from validateContextFile()
 * @param {boolean} asJson - true → emit JSON, false → human-readable
 * @returns {{ text: string, exitCode: 0|1, stream: 'stdout'|'stderr' }}
 */
export function buildValidationOutput(filePath, result, asJson) {
  if (asJson) {
    return {
      text: JSON.stringify(result, null, 2),
      exitCode: result.valid ? 0 : 1,
      stream: 'stdout',
    };
  }
  const display = path.relative(process.cwd(), filePath) || path.basename(filePath);
  if (result.valid) {
    return {
      text: chalk.green(`✓ ${display} is valid (schema v${result.data.schema_version})`),
      exitCode: 0,
      stream: 'stdout',
    };
  }
  const lines = [chalk.red(`✗ ${display} failed validation:`)];
  for (const err of result.errors) {
    const dotted = err.path?.length ? err.path.join('.') : '(root)';
    lines.push(`  [${err.code}] ${dotted}: ${err.message}`);
  }
  return { text: lines.join('\n'), exitCode: 1, stream: 'stderr' };
}

/**
 * Run the validate-context sub-command.
 *
 * @param {string} [filePathArg] - Path to CONTEXT.md, defaults to ./CONTEXT.md
 * @param {object} [options]
 * @param {boolean} [options.json] - Emit JSON output instead of human-readable
 */
export async function validateContext(filePathArg, options = {}) {
  const filePath = path.resolve(filePathArg ?? 'CONTEXT.md');
  const result = validateContextFile(filePath);
  const out = buildValidationOutput(filePath, result, Boolean(options.json));
  if (out.stream === 'stderr') console.error(out.text);
  else console.log(out.text);
  process.exit(out.exitCode);
}
