/**
 * Zod schema v1 for CONTEXT.md frontmatter.
 *
 * Enforces 16 MUST PASS structural criteria + 6 inter-field constraints
 * via .superRefine(). Locked design — see memory:
 * project_context_builder_schema_v1.md
 *
 * Consumed by: utils/validate-context.js, context-builder/writer.js
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 1;

// ── Enums ────────────────────────────────────────────────────────────

export const STACK_PRIMARY = z.enum([
  'node-ts',
  'node-js',
  'python',
  'go',
  'swift',
  'kotlin',
  'rust',
  'dotnet',
  'ruby',
  'java',
  'other',
]);

export const PROJECT_MODE = z.enum(['greenfield', 'in-place', 'from-context']);

// TIER_V1 keeps the legacy export name for source compatibility with
// v1.0-v1.2 callers. As of v1.27.0 it accepts the full 0/S/M/L matrix.
export const TIER_V1 = z.enum(['0', 's', 'm', 'l']);
export const TIER_VALUES = TIER_V1;

export const CONFIDENCE = z.enum(['high', 'medium', 'low', 'declared']);

// ── Valid dotted-paths for confidence keys and pending_decisions[].field ─

export const VALID_DOTTED_PATHS = [
  'project.name',
  'project.description',
  'project.mode',
  'stack.primary',
  'commands.install',
  'commands.test',
  'commands.type_check',
  'commands.dev',
  'commands.build',
  'commands.e2e',
  'tier.selected',
  'tier.rationale',
  'scaffold_options.include_pre_commit',
  'scaffold_options.include_github',
  'sources.primary_repo',
  'features.has_api',
  'features.has_database',
  'features.has_frontend',
  'features.has_design_system',
  'features.design_system_name',
  'features.has_prd',
  'audit_model',
];

// ── Sub-schemas ──────────────────────────────────────────────────────

const projectSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    mode: PROJECT_MODE,
  })
  .strict();

const stackSchema = z
  .object({
    primary: STACK_PRIMARY,
  })
  .strict();

const commandsSchema = z
  .object({
    install: z.string().min(1),
    test: z.string().min(1),
    type_check: z.string().nullable().optional(),
    dev: z.string().nullable().optional(),
    // v1.27.0+ (tier M/L): optional build / e2e commands.
    build: z.string().nullable().optional(),
    e2e: z.string().nullable().optional(),
  })
  .strict();

// v1.27.0+ tier M/L feature flags. All optional — tier 0/S projects skip
// the block entirely.
const featuresSchema = z
  .object({
    has_api: z.boolean().optional(),
    has_database: z.boolean().optional(),
    has_frontend: z.boolean().optional(),
    has_design_system: z.boolean().optional(),
    design_system_name: z.string().min(1).optional(),
    has_prd: z.boolean().optional(),
  })
  .strict();

const tierSchema = z
  .object({
    selected: TIER_V1,
    rationale: z.string().min(1),
  })
  .strict();

const scaffoldOptionsSchema = z
  .object({
    include_pre_commit: z.boolean(),
    include_github: z.boolean(),
  })
  .strict();

const sourcesSchema = z
  .object({
    primary_repo: z.string().min(1),
    repos: z.array(z.string()).optional(),
    docs: z.array(z.string()).optional(),
  })
  .strict();

const inferenceSchema = z
  .object({
    source_files: z.array(z.string()).min(1),
    confidence: z.record(z.string(), CONFIDENCE).optional(),
  })
  .strict();

const pendingDecisionSchema = z
  .object({
    field: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

// ── Base schema (structural only) ────────────────────────────────────

const baseContextSchema = z
  .object({
    schema_version: z.literal(1),
    generated_at: z.string().datetime(),
    generated_by: z.string().min(1),
    generated_by_version: z.string().regex(/^\d+\.\d+\.\d+/),

    project: projectSchema,
    stack: stackSchema,
    commands: commandsSchema,
    tier: tierSchema,
    scaffold_options: scaffoldOptionsSchema,

    sources: sourcesSchema.optional(),
    inference: inferenceSchema.optional(),
    pending_decisions: z.array(pendingDecisionSchema).optional(),

    // v1.27.0+ tier M/L extensions (all optional, additive vs v1.0-1.2).
    features: featuresSchema.optional(),
    audit_model: z.string().min(1).optional(),
  })
  .strict();

// ── Full schema with inter-field constraints ─────────────────────────

export const CONTEXT_SCHEMA_V1 = baseContextSchema.superRefine((data, ctx) => {
  // C1 — Tier 0 requires include_pre_commit=false AND include_github=false
  if (data.tier.selected === '0') {
    if (data.scaffold_options.include_pre_commit !== false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scaffold_options', 'include_pre_commit'],
        message: 'Tier 0 requires scaffold_options.include_pre_commit=false',
      });
    }
    if (data.scaffold_options.include_github !== false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scaffold_options', 'include_github'],
        message: 'Tier 0 requires scaffold_options.include_github=false',
      });
    }
  }

  // C2 — mode=from-context requires sources block with primary_repo
  if (data.project.mode === 'from-context' && !data.sources) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sources'],
      message: 'project.mode=from-context requires a sources block with primary_repo',
    });
  }

  // C3 — mode=greenfield must have neither sources nor inference
  if (data.project.mode === 'greenfield') {
    if (data.sources !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sources'],
        message: 'project.mode=greenfield must not have a sources block',
      });
    }
    if (data.inference !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inference'],
        message: 'project.mode=greenfield must not have an inference block',
      });
    }
  }

  // C4 — mode in {in-place, from-context} requires inference block
  if (data.project.mode === 'in-place' || data.project.mode === 'from-context') {
    if (!data.inference) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inference'],
        message: `project.mode=${data.project.mode} requires an inference block with source_files`,
      });
    }
  }

  // C5 — inference.confidence keys must be valid dotted-paths
  if (data.inference?.confidence) {
    for (const key of Object.keys(data.inference.confidence)) {
      if (!VALID_DOTTED_PATHS.includes(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['inference', 'confidence', key],
          message: `Invalid dotted-path "${key}". Allowed paths: ${VALID_DOTTED_PATHS.join(', ')}`,
        });
      }
    }
  }

  // C6 — pending_decisions[*].field must be a valid dotted-path
  if (data.pending_decisions) {
    data.pending_decisions.forEach((p, i) => {
      if (!VALID_DOTTED_PATHS.includes(p.field)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pending_decisions', i, 'field'],
          message: `Invalid dotted-path "${p.field}". Allowed paths: ${VALID_DOTTED_PATHS.join(', ')}`,
        });
      }
    });
  }

  // C7 (v1.27.0+) — features.has_design_system=true requires design_system_name
  if (data.features?.has_design_system === true && !data.features?.design_system_name) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['features', 'design_system_name'],
      message: 'features.has_design_system=true requires features.design_system_name',
    });
  }

  // C8 (v1.27.0+) — features block belongs to tier M/L. Tier 0/S projects
  // must not carry feature flags (they have no consumers in the scaffold).
  if (data.features && (data.tier.selected === '0' || data.tier.selected === 's')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['features'],
      message: `features block requires tier M or L; tier ${data.tier.selected} has no consumers for feature flags`,
    });
  }
});
