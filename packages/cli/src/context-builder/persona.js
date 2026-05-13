/**
 * Persona check (Q1) — routes the interview to PM or Dev flow.
 *
 * Routing locked in project_context_builder_decisions.md (decision D):
 *   - Software Engineer / Developer → dev flow (stub in v1)
 *   - Tech Lead                     → dev flow (stub in v1)
 *   - Product Manager               → PM flow
 *   - Founder / Solo builder        → PM flow
 *   - Other                         → PM flow
 */
import inquirer from 'inquirer';

export const PERSONAS = Object.freeze({
  DEVELOPER: 'developer',
  PM: 'pm',
  TECHLEAD: 'techlead',
  FOUNDER: 'founder',
  OTHER: 'other',
});

export const PERSONA_OPTIONS = [
  { value: PERSONAS.DEVELOPER, label: 'Software Engineer / Developer' },
  { value: PERSONAS.PM, label: 'Product Manager' },
  { value: PERSONAS.TECHLEAD, label: 'Tech Lead' },
  { value: PERSONAS.FOUNDER, label: 'Founder / Solo builder' },
  { value: PERSONAS.OTHER, label: 'Other (Designer, EM, DevOps, Data, …)' },
];

const DEV_FLOW_PERSONAS = new Set([PERSONAS.DEVELOPER, PERSONAS.TECHLEAD]);

/**
 * Route a persona to either 'dev' or 'pm' flow.
 */
export function routePersona(persona) {
  return DEV_FLOW_PERSONAS.has(persona) ? 'dev' : 'pm';
}

/**
 * Ask the persona check question via inquirer.
 *
 * @param {object} [options]
 * @param {string} [options.prefilled] - Bypass inquirer (for tests / scripting)
 * @returns {Promise<string>}
 */
export async function askPersona(options = {}) {
  if (options.prefilled) return options.prefilled;
  const { persona } = await inquirer.prompt([
    {
      type: 'list',
      name: 'persona',
      message: 'Which best describes your role on this project?',
      choices: PERSONA_OPTIONS.map((o) => ({ name: o.label, value: o.value })),
    },
  ]);
  return persona;
}
