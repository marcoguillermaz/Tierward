/**
 * CONTEXT.md MUST PASS validator.
 *
 * Wraps the Zod schema (context-builder/schema.js) with frontmatter
 * parsing and file I/O concerns. Returns a structured result usable
 * by both the Context Builder (post-generation check) and the init
 * wizard (pre-scaffold check).
 *
 * See memory: project_context_builder_rubric_v1.md (16 MUST PASS criteria)
 */
import fs from 'fs';
import yaml from 'js-yaml';
import { CONTEXT_SCHEMA_V1 } from '../context-builder/schema.js';

export const ValidationCode = Object.freeze({
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  EMPTY_FILE: 'EMPTY_FILE',
  NO_FRONTMATTER: 'NO_FRONTMATTER',
  YAML_PARSE_ERROR: 'YAML_PARSE_ERROR',
  SCHEMA_VIOLATION: 'SCHEMA_VIOLATION',
});

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

/**
 * Extract YAML frontmatter and body from a markdown content string.
 *
 * @param {string} content - Raw CONTEXT.md content
 * @returns {{ frontmatter: object|null, body: string, error: string|null }}
 */
export function parseContextFile(content) {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return {
      frontmatter: null,
      body: content,
      error: 'No frontmatter delimiters (---) found at start of file',
    };
  }
  let frontmatter;
  try {
    frontmatter = yaml.load(match[1]);
  } catch (e) {
    return {
      frontmatter: null,
      body: content.slice(match[0].length).replace(/^\n+/, ''),
      error: `YAML parse error: ${e.message}`,
    };
  }
  if (frontmatter === null || frontmatter === undefined || typeof frontmatter !== 'object') {
    return {
      frontmatter: null,
      body: content.slice(match[0].length).replace(/^\n+/, ''),
      error: 'YAML frontmatter must be a mapping (key-value object)',
    };
  }
  return {
    frontmatter,
    body: content.slice(match[0].length).replace(/^\n+/, ''),
    error: null,
  };
}

/**
 * Validate a CONTEXT.md content string against schema v1.
 *
 * @param {string} content - Raw CONTEXT.md content
 * @returns {{ valid: boolean, errors: Array<{code, message, path}>, data: object|null, body: string|null }}
 */
export function validateContextContent(content) {
  if (!content || content.trim() === '') {
    return {
      valid: false,
      errors: [{ code: ValidationCode.EMPTY_FILE, message: 'File is empty', path: [] }],
      data: null,
      body: null,
    };
  }
  const parsed = parseContextFile(content);
  if (parsed.error) {
    const isYaml = parsed.error.startsWith('YAML');
    return {
      valid: false,
      errors: [
        {
          code: isYaml ? ValidationCode.YAML_PARSE_ERROR : ValidationCode.NO_FRONTMATTER,
          message: parsed.error,
          path: [],
        },
      ],
      data: null,
      body: parsed.body,
    };
  }
  const schemaResult = CONTEXT_SCHEMA_V1.safeParse(parsed.frontmatter);
  if (!schemaResult.success) {
    return {
      valid: false,
      errors: schemaResult.error.issues.map((issue) => ({
        code: ValidationCode.SCHEMA_VIOLATION,
        message: issue.message,
        path: issue.path,
      })),
      data: null,
      body: parsed.body,
    };
  }
  return {
    valid: true,
    errors: [],
    data: schemaResult.data,
    body: parsed.body,
  };
}

/**
 * Validate a CONTEXT.md file at the given path.
 *
 * @param {string} filePath - Absolute or relative path to CONTEXT.md
 * @returns {{ valid: boolean, errors: Array<{code, message, path}>, data: object|null, body: string|null }}
 */
export function validateContextFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      valid: false,
      errors: [
        {
          code: ValidationCode.FILE_NOT_FOUND,
          message: `File not found: ${filePath}`,
          path: [],
        },
      ],
      data: null,
      body: null,
    };
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return validateContextContent(content);
}
