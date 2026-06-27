import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.resolve(__dirname, '../../templates/common/CONTEXT_IMPORT.md');
const GREENFIELD_TEMPLATE_PATH = path.resolve(
  __dirname,
  '../../templates/common/CONTEXT_IMPORT_GREENFIELD.md',
);

/**
 * Generate the greenfield CONTEXT_IMPORT.md — an idea-based discovery workflow.
 *
 * Greenfield has no source repos/docs to import, so the import-from-repo template
 * (and its [SOURCE_REPOS]/[IMPORT_MODE] placeholders) is the wrong shape and is
 * left raw by interpolate(). This variant keeps the PENDING_DISCOVERY trigger but
 * drives discovery from the project idea (the wizard's one-line description).
 */
export async function generateGreenfieldContextImport(config, targetDir) {
  let template = await fs.readFile(GREENFIELD_TEMPLATE_PATH, 'utf8');
  template = template
    .replace(/\[PROJECT_NAME\]/g, config.projectName || 'this project')
    .replace(
      /\[PROJECT_DESCRIPTION\]/g,
      config.description ||
        '_(no description was provided at init — infer the idea from any brief in the project directory, then confirm with the developer)_',
    );
  await fs.writeFile(path.join(targetDir, 'CONTEXT_IMPORT.md'), template);
}

/**
 * Generate CONTEXT_IMPORT.md from the template, injecting actual source info.
 */
export async function generateContextImport(config, targetDir, clonedRepos, copiedDocs) {
  let template = await fs.readFile(TEMPLATE_PATH, 'utf8');

  const mode = config.mode === 'in-place' ? 'in-place' : 'from-context';

  // Build repo list section
  const repoList =
    clonedRepos.length > 0
      ? clonedRepos
          .map((r) => {
            const contextPath = r.error
              ? `⚠ ${r.source} - clone failed: ${r.error}`
              : `- \`.claude/context/repos/${r.name}/\` ← from \`${r.source}\``;
            return contextPath;
          })
          .join('\n')
      : mode === 'in-place'
        ? '- `.` (current directory - the project itself)'
        : '*(none provided)*';

  // Build docs list section
  const docList =
    copiedDocs.length > 0
      ? copiedDocs.map((d) => `- \`.claude/context/docs/${path.basename(d)}\``).join('\n')
      : '*(none provided)*';

  // Primary repo
  const primaryLabel = config.primaryRepo
    ? path.basename(
        config.primaryRepo
          .split('/')
          .pop()
          ?.replace(/\.git$/, '') || config.primaryRepo,
      )
    : clonedRepos[0]?.name || '.';

  template = template
    .replace('[IMPORT_MODE]', mode)
    .replace('[SOURCE_REPOS]', repoList)
    .replace('[SOURCE_DOCS]', docList)
    .replace('[PRIMARY_REPO]', primaryLabel);

  const destPath = path.join(targetDir, 'CONTEXT_IMPORT.md');
  await fs.writeFile(destPath, template);
}
