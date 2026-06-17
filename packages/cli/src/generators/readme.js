import fs from 'fs-extra';
import path from 'path';

const tierDescriptions = {
  s: 'Fast Lane (Tier S) - minimal pipeline for bugfixes and small changes',
  m: 'Standard (Tier M) - 5-phase pipeline for feature blocks',
  l: 'Full (Tier L) - complete governance pipeline for complex, long-running projects',
};

export async function generateReadme(config, targetDir) {
  const tier = (config.tier || 's').toLowerCase();
  const tierDesc = tierDescriptions[tier] || '';

  const content = `# ${config.projectName}

${config.description}

---

## Development

\`\`\`bash
${config.installCommand || 'npm install'}
${config.devCommand || 'npm run dev'}
\`\`\`

## Testing

\`\`\`bash
${config.testCommand || 'npm test'}
${config.typeCheckCommand ? config.typeCheckCommand + '   # type check' : ''}
\`\`\`

## AI-Assisted Development

This project uses [Claude Code](https://claude.ai/code) with a governance scaffold provided by [tierward](https://github.com/marcoguillermaz/tierward).

**Pipeline**: ${tierDesc}

Key files:
- \`CLAUDE.md\` - project context for Claude (tech stack, conventions, known patterns)
- \`.claude/rules/pipeline.md\` - mandatory development workflow
- \`.claude/settings.json\` - tool permissions and governance hooks
- \`docs/adr/\` - architecture decision records

**Every AI-assisted commit is tagged** via \`attribution.commit\` in \`.claude/settings.json\`
and should be reviewed by a human before merging to shared branches.

### Getting started

1. Install [Claude Code CLI](https://claude.ai/code)
2. Open the project in your terminal and run \`claude\`
3. Claude will load \`CLAUDE.md\` and \`.claude/rules/\` automatically

### Governance

| Control | How it works |
|---|---|
| Test gate | Claude cannot complete a task until \`${config.testCommand || 'npm test'}\` passes (Stop hook) |
| Audit log | Every tool use is logged to \`~/.claude/audit/\` |
| Secret scanning | Pre-commit hook blocks accidental credential commits |
| CODEOWNERS | \`.claude/\` directory requires tech lead review on all PRs |

---

## Contributing

See \`.github/PULL_REQUEST_TEMPLATE.md\` for the PR checklist.
All PRs that include AI-generated code must complete the AI review checklist.
`;

  await fs.writeFile(path.join(targetDir, 'README.md'), content);
}
