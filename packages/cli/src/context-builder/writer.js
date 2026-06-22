/**
 * Serialize CONTEXT.md from a frontmatter data object + optional body.
 *
 * Round-trip property: validateContextContent(serializeContext(data)) is
 * valid whenever data conforms to schema v1. Tested in writer.test.js.
 *
 * Default body provides the three sections lockedin the design
 * (project_context_builder_schema_v1.md): What we are building /
 * Operational constraints / Open questions.
 */
import fs from 'fs';
import * as yaml from 'js-yaml';

export const DEFAULT_BODY = `# Project Context

## What we are building
[Describe what you're building — 1-3 paragraphs]

## Operational constraints
[Deadlines, governance, regulatory requirements, team rules]

## Open questions
[Questions to track. Auto-populated from pending_decisions during interview.]
`;

const YAML_DUMP_OPTIONS = {
  indent: 2,
  lineWidth: -1,
  noRefs: true,
  sortKeys: false,
  quotingType: "'",
  forceQuotes: false,
};

/**
 * Serialize a CONTEXT.md content string from frontmatter data + body.
 *
 * @param {object} data - Frontmatter object conforming to schema v1
 * @param {string} [body] - Markdown body. Defaults to DEFAULT_BODY (3 sections).
 * @returns {string} Full CONTEXT.md content
 */
export function serializeContext(data, body) {
  const yamlBlock = yaml.dump(data, YAML_DUMP_OPTIONS);
  const finalBody = body !== undefined ? body : DEFAULT_BODY;
  return `---\n${yamlBlock}---\n\n${finalBody}`;
}

/**
 * Write a CONTEXT.md file to disk.
 *
 * @param {string} filePath - Destination path
 * @param {object} data - Frontmatter object
 * @param {string} [body] - Optional body markdown
 * @returns {string} The content written
 */
export function writeContextFile(filePath, data, body) {
  const content = serializeContext(data, body);
  fs.writeFileSync(filePath, content, 'utf8');
  return content;
}
