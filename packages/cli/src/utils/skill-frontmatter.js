const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

export function parseSkillFile(content) {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: null, body: content, fields: {}, raw: content };
  }
  const frontmatter = match[1];
  const body = content.slice(match[0].length).replace(/^\n+/, '');
  return {
    frontmatter,
    body,
    fields: extractFields(frontmatter),
    raw: content,
  };
}

export function extractFields(frontmatter) {
  const fields = {};
  const scalar = (key) => {
    const re = new RegExp(`^${key}:\\s*(.+)$`, 'm');
    const m = frontmatter.match(re);
    return m ? m[1].trim() : null;
  };
  fields.name = scalar('name');
  fields.description = scalar('description');
  fields.context = scalar('context');
  fields.background = scalar('background');
  fields.model = scalar('model');
  fields.userInvocable = scalar('user-invocable');
  fields.argumentHint = scalar('argument-hint');
  fields.allowedTools = scalar('allowed-tools');
  return fields;
}

export function countBodyLines(body) {
  if (!body) return 0;
  const trimmed = body.replace(/\n+$/, '');
  if (trimmed === '') return 0;
  return trimmed.split('\n').length;
}
