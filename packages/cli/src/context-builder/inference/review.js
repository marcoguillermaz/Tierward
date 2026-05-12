/**
 * Phase 3 — Hybrid PM review of inference draft.
 *
 * Strategy (locked in project_context_builder_inference_v1.md):
 *   - high confidence  → batch (group) review, single ack
 *   - low/medium       → field-by-field review with explicit Confirm/Edit/Skip
 *   - On Confirm or Edit → confidence upgrades to "declared"
 *   - On Skip           → entry pushed to pending_decisions[]
 *
 * Public surface:
 *   - mergeLlmIntoDraft(): integrate Phase 2 output into Phase 1 draft
 *   - groupFieldsByConfidence(): partition into {high, lowMedium}
 *   - applyReview(): pure reducer (draft, confidence, pending) + answers → updated
 *   - runInteractiveReview(): inquirer-driven runner (thin wrapper)
 *   - getDottedPath / setDottedPath: utility for dotted-path access
 */
import inquirer from 'inquirer';

/**
 * Walk a dotted path on an object. Returns undefined if any step is missing.
 */
export function getDottedPath(obj, dottedPath) {
  if (!obj || !dottedPath) return undefined;
  const parts = dottedPath.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Set a dotted path on an object (mutates). Creates intermediate objects.
 */
export function setDottedPath(obj, dottedPath, value) {
  const parts = dottedPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === undefined || cur[parts[i]] === null) {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

/**
 * Merge Phase 2 LLM output into a Phase 1 draft.
 * Adds project.description, tier.rationale; appends pending_decisions;
 * extracts body sections (kept out-of-frontmatter, fed to body composer).
 *
 * @param {object} draft - Phase 1 draft
 * @param {object} llmOut - Phase 2 LLM output
 * @returns {{ draft: object, pending_decisions: Array, body_sections: object }}
 */
export function mergeLlmIntoDraft(draft, llmOut, existingPending = []) {
  const merged = structuredClone(draft);

  if (llmOut?.description) {
    if (!merged.project) merged.project = {};
    merged.project.description = llmOut.description;
  }
  if (llmOut?.tier_rationale_hint) {
    if (!merged.tier) merged.tier = {};
    merged.tier.rationale = llmOut.tier_rationale_hint;
  }

  const pending = [...existingPending];
  if (Array.isArray(llmOut?.pending_decisions)) {
    for (const pd of llmOut.pending_decisions) {
      if (pd?.field && pd?.reason && !pending.some((p) => p.field === pd.field)) {
        pending.push({ field: pd.field, reason: pd.reason });
      }
    }
  }

  const body_sections = {
    what_building: cleanLlmText(llmOut?.body_what_building),
    operational_constraints: cleanLlmText(llmOut?.body_operational_constraints),
    open_questions: cleanLlmText(llmOut?.body_open_questions),
  };

  return { draft: merged, pending_decisions: pending, body_sections };
}

/**
 * Filter out LLM "boilerplate refusal" strings ("None evident", "N/A", …)
 * so the prose review fallback can prompt the PM to provide real content.
 */
const BOILERPLATE_RE = /^(none(\s+evident)?(\s+from\s+the\s+repo)?|n\/?a|nothing\s+specific)\.?$/i;
export function cleanLlmText(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (BOILERPLATE_RE.test(trimmed)) return '';
  return trimmed;
}

/**
 * Compose body markdown from sections. Returns undefined when all three
 * sections are empty (caller falls back to DEFAULT_BODY placeholder).
 */
export function composeBodyMarkdown(sections) {
  const w = (sections?.what_building ?? '').trim();
  const c = (sections?.operational_constraints ?? '').trim();
  const q = (sections?.open_questions ?? '').trim();
  if (!w && !c && !q) return undefined;
  return `# Project Context

## What we are building
${w || "[Describe what you're building — 1-3 paragraphs]"}

## Operational constraints
${c || '[Deadlines, governance, regulatory requirements, team rules]'}

## Open questions
${q || '[Questions to track. Auto-populated from pending_decisions during interview.]'}
`;
}

/**
 * Run prose review for existing-mode runs: asks the PM to fill body
 * sections that are still empty after the LLM phase. Pure-fn friendly:
 * pass `prefilledProse` to bypass inquirer in tests.
 *
 * @param {object} state - Current review state with body_sections
 * @param {object} [options]
 * @param {object} [options.prefilledProse] - Map of section name → text
 * @returns {Promise<object>} Updated state
 */
export async function runProseReviewForExisting(state, options = {}) {
  const sections = { ...(state.body_sections ?? {}) };

  if (options.prefilledProse) {
    return {
      ...state,
      body_sections: {
        what_building: options.prefilledProse.what_building ?? sections.what_building ?? '',
        operational_constraints:
          options.prefilledProse.operational_constraints ?? sections.operational_constraints ?? '',
        open_questions: options.prefilledProse.open_questions ?? sections.open_questions ?? '',
      },
    };
  }

  const questions = [];
  if (!sections.what_building?.trim()) {
    questions.push({
      type: 'input',
      name: 'what_building',
      message: 'What are you building? (1-2 sentences, skip ok)',
      default: '',
    });
  }
  if (!sections.operational_constraints?.trim()) {
    questions.push({
      type: 'input',
      name: 'operational_constraints',
      message: 'Any operational constraints? (deadlines, governance) (skip ok)',
      default: '',
    });
  }
  if (!sections.open_questions?.trim()) {
    questions.push({
      type: 'input',
      name: 'open_questions',
      message: 'Any open questions to track? (skip ok)',
      default: '',
    });
  }

  if (questions.length === 0) return state;
  const answers = await inquirer.prompt(questions);
  return {
    ...state,
    body_sections: {
      what_building: answers.what_building?.trim() || sections.what_building || '',
      operational_constraints:
        answers.operational_constraints?.trim() || sections.operational_constraints || '',
      open_questions: answers.open_questions?.trim() || sections.open_questions || '',
    },
  };
}

/**
 * Partition confidence map into two groups for hybrid review.
 *
 * @param {object} confidence - Map of dotted-path → 'high'|'medium'|'low'|'declared'
 * @returns {{ high: string[], lowMedium: string[], declared: string[] }}
 */
export function groupFieldsByConfidence(confidence) {
  const high = [];
  const lowMedium = [];
  const declared = [];
  for (const [field, conf] of Object.entries(confidence ?? {})) {
    if (conf === 'high') high.push(field);
    else if (conf === 'declared') declared.push(field);
    else lowMedium.push(field);
  }
  return { high, lowMedium, declared };
}

/**
 * Apply a list of review answers to draft + confidence + pending.
 * Pure function. Returns a new object — does not mutate inputs.
 *
 * @param {object} state - { draft, confidence, pending_decisions }
 * @param {Array<{field, action, value?, reason?}>} answers
 *   action: 'confirm' | 'edit' | 'skip'
 * @returns {object} updated state
 */
export function applyReview(state, answers) {
  const newDraft = structuredClone(state.draft);
  const newConfidence = { ...state.confidence };
  const newPending = [...(state.pending_decisions ?? [])];

  for (const ans of answers ?? []) {
    if (!ans || !ans.field || !ans.action) continue;
    if (ans.action === 'confirm') {
      newConfidence[ans.field] = 'declared';
    } else if (ans.action === 'edit') {
      setDottedPath(newDraft, ans.field, ans.value);
      newConfidence[ans.field] = 'declared';
    } else if (ans.action === 'skip') {
      if (!newPending.some((p) => p.field === ans.field)) {
        newPending.push({
          field: ans.field,
          reason: ans.reason ?? 'Skipped during PM review',
        });
      }
    }
  }

  return {
    draft: newDraft,
    confidence: newConfidence,
    pending_decisions: newPending,
  };
}

/**
 * Run an interactive PM review using inquirer.
 * Returns the updated state.
 *
 * Tests inject prefilledAnswers to bypass inquirer.
 */
export async function runInteractiveReview(state, options = {}) {
  if (options.prefilledAnswers) {
    return applyReview(state, options.prefilledAnswers);
  }

  const { high, lowMedium } = groupFieldsByConfidence(state.confidence);
  const answers = [];

  // High-confidence group: single batch ack
  if (high.length > 0) {
    const summary = high
      .map((f) => `  ${f} = ${JSON.stringify(getDottedPath(state.draft, f))}`)
      .join('\n');
    const { batchOk } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'batchOk',
        message: `High-confidence fields (auto-detected):\n${summary}\n\nAll correct?`,
        default: true,
      },
    ]);
    if (batchOk) {
      for (const f of high) answers.push({ field: f, action: 'confirm' });
    } else {
      // Fall back to per-field for the batch
      for (const f of high) {
        const result = await reviewSingleField(state.draft, f);
        answers.push(result);
      }
    }
  }

  // Low/medium: per-field review
  for (const f of lowMedium) {
    const result = await reviewSingleField(state.draft, f);
    answers.push(result);
  }

  return applyReview(state, answers);
}

async function reviewSingleField(draft, field) {
  const current = getDottedPath(draft, field);
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: `${field} = ${JSON.stringify(current)} — ?`,
      choices: [
        { name: 'Confirm', value: 'confirm' },
        { name: 'Edit', value: 'edit' },
        { name: 'Skip (mark as pending)', value: 'skip' },
      ],
    },
  ]);
  if (action === 'edit') {
    const { value } = await inquirer.prompt([
      { type: 'input', name: 'value', message: `New value for ${field}:`, default: current },
    ]);
    return { field, action: 'edit', value };
  }
  if (action === 'skip') {
    const { reason } = await inquirer.prompt([
      { type: 'input', name: 'reason', message: 'Why skip?', default: "I don't know yet" },
    ]);
    return { field, action: 'skip', reason };
  }
  return { field, action: 'confirm' };
}
