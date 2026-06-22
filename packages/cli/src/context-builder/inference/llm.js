/**
 * Phase 2 — LLM-based semantic extraction.
 *
 * Calls the Anthropic Messages API to extract fields that algorithmic
 * inference cannot determine: project.description, tier rationale hint,
 * candidate pending_decisions.
 *
 * Designed for testability: the LLM client is injectable. The default
 * client uses global fetch() to call the Anthropic API directly (no SDK
 * dependency). Tests pass a mock client.
 *
 * Requires ANTHROPIC_API_KEY in the environment when the default client
 * is used. Honors TIERWARD_CONTEXT_LLM_MODEL (or the legacy CDK_CONTEXT_LLM_MODEL)
 * to override the default model.
 *
 * See memory: project_context_builder_inference_v1.md
 */
import fs from 'fs-extra';
import path from 'node:path';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const SUMMARY_BUDGET_CHARS = 8000;

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '__pycache__',
  'venv',
  '.venv',
  '.next',
  '.turbo',
  'target',
  'DerivedData',
]);

/**
 * Build a small textual summary of a repository for the LLM:
 * README (if present) + one-level directory listing.
 *
 * @param {string} dir
 * @param {number} [limitChars=8000]
 */
export async function buildRepoSummary(dir, limitChars = SUMMARY_BUDGET_CHARS) {
  const parts = [];

  for (const candidate of ['README.md', 'README.txt', 'README']) {
    const p = path.join(dir, candidate);
    if (await fs.pathExists(p)) {
      const content = await fs.readFile(p, 'utf8').catch(() => '');
      if (content) {
        parts.push(`### README: ${candidate}\n\n${content}\n`);
        break;
      }
    }
  }

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const tree = entries
      .filter((e) => !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
      .slice(0, 40)
      .map((e) => `  ${e.isDirectory() ? '📁' : '📄'} ${e.name}`);
    if (tree.length) {
      parts.push(`### Top-level tree\n\n${tree.join('\n')}\n`);
    }
  } catch {
    // ignore
  }

  const joined = parts.join('\n');
  return joined.length > limitChars ? `${joined.slice(0, limitChars)}\n…[truncated]` : joined;
}

const SYSTEM_PROMPT = `You are a Context Builder assistant. Given a project's README and structure, infer a brief project description, a tier rationale, and three body sections for a Markdown context file.

Return ONLY a JSON object with these exact fields:
{
  "description": "<one-sentence description, max 30 words>",
  "tier_rationale_hint": "<one-sentence plausible rationale for the selected tier>",
  "pending_decisions": [{"field": "<dotted-path>", "reason": "<why this is uncertain>"}],
  "body_what_building": "<1-3 sentences expanding on the description, specific to the project>",
  "body_operational_constraints": "<concrete constraints found in the repo (CI, deps policies, deadlines if mentioned in README); say 'None evident from the repo' if none>",
  "body_open_questions": "<questions a new contributor would ask after reading the repo; say 'None evident' if none>"
}

Rules:
- description must reflect what the project actually does, not boilerplate.
- tier_rationale_hint must be specific to this project, not generic.
- pending_decisions may be an empty array if nothing is unclear.
- pending_decisions[*].field must be one of: project.name, project.description, project.mode, stack.primary, commands.install, commands.test, commands.type_check, commands.dev, tier.selected, tier.rationale, scaffold_options.include_pre_commit, scaffold_options.include_github, sources.primary_repo.
- Body sections must be specific to the project. Do NOT echo placeholders. Use "None evident" only when you truly cannot infer anything.
- Do not invent commands or stack types not present in the draft.`;

/**
 * Compose the system + user prompts for the LLM extractor.
 */
export function buildExtractionPrompt(repoSummary, draft) {
  const user = `## Algorithmic draft so far\n\`\`\`json\n${JSON.stringify(draft, null, 2)}\n\`\`\`\n\n## Repo summary\n\n${repoSummary}\n\nReturn JSON only, no prose.`;
  return { system: SYSTEM_PROMPT, user };
}

/**
 * Tolerant JSON parser for LLM responses that may contain wrapper prose
 * or code-fence markers. Extracts the first balanced JSON object.
 */
export function parseLlmResponse(text) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) throw new Error('Empty LLM response');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in LLM response');
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

async function defaultLlmClient({ system, user, model, apiKey }) {
  const response = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Anthropic API ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (!content) throw new Error('Empty content[].text in Anthropic response');
  return content;
}

/**
 * Run Phase 2 extraction.
 *
 * @param {object} options
 * @param {string} options.dir - Project root
 * @param {object} options.draft - Algorithmic draft (from Phase 1)
 * @param {Function} [options.llmClient] - Override LLM caller (for tests)
 * @param {string} [options.model] - Model id
 * @param {string} [options.apiKey] - Override env var
 * @returns {Promise<{ description: string, tier_rationale_hint: string, pending_decisions: Array<{field, reason}> }>}
 */
export async function extractWithLlm({ dir, draft, llmClient, model, apiKey } = {}) {
  if (!dir) throw new Error('dir is required');
  if (!draft) throw new Error('draft is required');

  const summary = await buildRepoSummary(dir);
  const { system, user } = buildExtractionPrompt(summary, draft);

  const client = llmClient ?? defaultLlmClient;
  const resolvedKey = apiKey ?? process.env.ANTHROPIC_API_KEY;
  const resolvedModel =
    model ??
    process.env.TIERWARD_CONTEXT_LLM_MODEL ??
    process.env.CDK_CONTEXT_LLM_MODEL ??
    DEFAULT_MODEL;

  if (client === defaultLlmClient && !resolvedKey) {
    throw new Error('ANTHROPIC_API_KEY not set; either set it or pass a custom llmClient');
  }

  const raw = await client({ system, user, model: resolvedModel, apiKey: resolvedKey });
  const parsed = parseLlmResponse(raw);

  const str = (v) => (typeof v === 'string' ? v : '');
  return {
    description: str(parsed.description),
    tier_rationale_hint: str(parsed.tier_rationale_hint),
    pending_decisions: Array.isArray(parsed.pending_decisions) ? parsed.pending_decisions : [],
    body_what_building: str(parsed.body_what_building),
    body_operational_constraints: str(parsed.body_operational_constraints),
    body_open_questions: str(parsed.body_open_questions),
  };
}

export const __testing__ = { defaultLlmClient, SYSTEM_PROMPT };
