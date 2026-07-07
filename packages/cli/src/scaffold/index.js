import fs from 'fs-extra';
import path from 'path';
import { NATIVE_STACKS, getSkillsToRemove, getCheatsheetSkillsToRemove } from './skill-registry.js';
import { STACK_COMMANDS, TEST_INFRA_MARKERS } from '../utils/stack-commands.js';

/**
 * Scaffold Tier 0 (Discovery) - minimal: settings.json, GETTING_STARTED.md only.
 * CLAUDE.md is generated separately by generateClaudeMd() - not copied here.
 * No pipeline, no docs folder, no pre-commit, no .github.
 */
async function scaffoldTier0(targetDir, config, templatesDir) {
  const tierDir = path.join(templatesDir, 'tier-0');

  // Copy Tier 0 files with interpolation (CLAUDE.md handled by generateClaudeMd)
  const files = [
    { src: 'GETTING_STARTED.md', dest: 'GETTING_STARTED.md' },
    { src: '.claude/settings.json', dest: '.claude/settings.json' },
  ];

  for (const { src, dest } of files) {
    const srcPath = path.join(tierDir, src);
    const destPath = path.join(targetDir, dest);
    if (!(await fs.pathExists(srcPath))) continue;
    await fs.ensureDir(path.dirname(destPath));
    const content = await fs.readFile(srcPath, 'utf8');
    await fs.writeFile(destPath, interpolate(content, config));
  }

  // Copy the communication-governance rule only. Tier 0 deliberately gets no
  // workflow governance (no pipeline, git, security, or context-review rules) -
  // output-style.md is the single behavioral rule its CLAUDE.md @-imports.
  const outputStyleSrc = path.join(templatesDir, 'common', 'rules', 'output-style.md');
  if (await fs.pathExists(outputStyleSrc)) {
    const outputStyleDest = path.join(targetDir, '.claude', 'rules', 'output-style.md');
    await fs.ensureDir(path.dirname(outputStyleDest));
    const content = await fs.readFile(outputStyleSrc, 'utf8');
    await fs.writeFile(outputStyleDest, interpolate(content, config));
  }

  // Create session directory (used by Claude for session recovery)
  await fs.ensureDir(path.join(targetDir, '.claude', 'session'));
}

/**
 * Scaffold a tier's template files into the target directory.
 * Copies common files first, then tier-specific files (tier overrides common).
 */
export async function scaffoldTier(tier, targetDir, config, templatesDir) {
  // Tier 0 is its own minimal path
  if (tier === '0') {
    return scaffoldTier0(targetDir, config, templatesDir);
  }
  const commonDir = path.join(templatesDir, 'common');
  const tierDir = path.join(templatesDir, `tier-${tier.toLowerCase()}`);

  // Copy common files - skip rules/ here, handled separately below
  const commonFileMap = {
    gitignore: '.gitignore',
    'pre-commit-config.yaml': '.pre-commit-config.yaml',
    'adr-template.md': 'docs/adr/template.md',
    'PULL_REQUEST_TEMPLATE.md': '.github/PULL_REQUEST_TEMPLATE.md',
    CODEOWNERS: '.github/CODEOWNERS',
    'context-review.md': '.claude/rules/context-review.md',
    'files-guide.md': '.claude/files-guide.md',
    'pipeline-standards.md': 'docs/pipeline-standards.md',
    'claudemd-standards.md': 'docs/claudemd-standards.md',
    'model-effort-policy.md': 'docs/model-effort-policy.md',
  };

  // Tier S (Fast Lane): skip informational docs not needed for quick fixes.
  // Exclude via skipFiles (7th arg), NOT by deleting from the map: an unmapped
  // common file is still copied — to the project root under its raw source name
  // (destName falls back to entry.name). Deleting the map entry therefore
  // relocates the file to root instead of skipping it.
  const commonSkipFiles =
    tier.toLowerCase() === 's'
      ? [
          'adr-template.md',
          'files-guide.md',
          'pipeline-standards.md',
          'claudemd-standards.md',
          'model-effort-policy.md',
        ]
      : [];

  await copyTemplateDir(commonDir, targetDir, config, commonFileMap, config, ['rules'], commonSkipFiles);

  // Copy tier-specific files (includes tier rules/ like pipeline.md)
  // CLAUDE.md is skipped - generated separately by generateClaudeMd()
  if (await fs.pathExists(tierDir)) {
    await copyTemplateDir(tierDir, targetDir, config, {}, config, [], ['CLAUDE.md']);
  }

  // Copy rules/ subdirectory from common - select security variant by stack family
  const commonRulesDir = path.join(commonDir, 'rules');
  if (await fs.pathExists(commonRulesDir)) {
    const securityVariant = securityRuleVariant(config);
    const rules = await fs.readdir(commonRulesDir);
    for (const rule of rules) {
      // Security variant selection: skip all security-*.md variants and the base security.md.
      // Only the selected variant is copied, always as security.md in the output.
      if (rule.startsWith('security')) {
        if (rule === securityVariant) {
          const src = path.join(commonRulesDir, rule);
          const dest = path.join(targetDir, '.claude', 'rules', 'security.md');
          await fs.ensureDir(path.dirname(dest));
          const content = await fs.readFile(src, 'utf8');
          await fs.writeFile(dest, interpolate(content, config));
        }
        continue;
      }
      const src = path.join(commonRulesDir, rule);
      const dest = path.join(targetDir, '.claude', 'rules', rule);
      await fs.ensureDir(path.dirname(dest));
      const content = await fs.readFile(src, 'utf8');
      await fs.writeFile(dest, interpolate(content, config));
    }
  }

  // Create session directory
  await fs.ensureDir(path.join(targetDir, '.claude', 'session'));

  // Create ADR directory
  await fs.ensureDir(path.join(targetDir, 'docs', 'adr'));

  // Conditionally exclude files the user opted out of
  if (!config.includePreCommit) {
    await fs.remove(path.join(targetDir, '.pre-commit-config.yaml'));
  }
  if (!config.includeGithub) {
    await fs.remove(path.join(targetDir, '.github'));
  }

  // Conditionally remove docs, skills, and cheatsheet rows that are not applicable
  if (tier === 'm' || tier === 'l') {
    await pruneConditionalDocs(targetDir, config);
    await pruneSkills(targetDir, config);
    await pruneCheatsheet(targetDir, config);
  } else if (tier === 's') {
    await pruneSkills(targetDir, config);
  }

  // Post-process settings.json: replace default permissions.allow with stack-aware permissions
  await patchSettingsPermissions(targetDir, config);
}

/**
 * Remove optional docs that are not applicable based on project feature flags.
 * Docs are only pruned when a feature flag is explicitly set to false (not undefined).
 */
async function pruneConditionalDocs(targetDir, config) {
  const isNative = NATIVE_STACKS.includes(config.techStack);

  if (config.hasFrontend === false || isNative) {
    await fs.remove(path.join(targetDir, 'docs', 'sitemap.md'));
  }
  if (config.hasDatabase === false) {
    await fs.remove(path.join(targetDir, 'docs', 'db-map.md'));
  }
}

/**
 * Remove skill directories that are not applicable based on project feature flags.
 * Skills are only pruned when a feature flag is explicitly set to false (not undefined).
 */
async function pruneSkills(targetDir, config) {
  const skillsDir = path.join(targetDir, '.claude', 'skills');
  if (!(await fs.pathExists(skillsDir))) return;

  for (const skill of getSkillsToRemove(config)) {
    await fs.remove(path.join(skillsDir, skill));
  }
}

/**
 * Remove cheatsheet rows for skills that were pruned.
 */
async function pruneCheatsheet(targetDir, config) {
  const cheatPath = path.join(targetDir, '.claude', 'cheatsheet.md');
  if (!(await fs.pathExists(cheatPath))) return;

  let content = await fs.readFile(cheatPath, 'utf8');

  for (const skill of getCheatsheetSkillsToRemove(config)) {
    content = content.replace(new RegExp(`^\\| \`\\/${skill}\` .*\\n`, 'm'), '');
  }

  // Remove staging workflow rows for native stacks (no staging branch/URL)
  if (NATIVE_STACKS.includes(config.techStack)) {
    content = content.replace(/^\| Merge to staging .*\n/m, '');
    content = content.replace(/^\| Promote to production .*\n/m, '');
  }

  // Replace web-centric skill descriptions with native equivalents
  if (NATIVE_STACKS.includes(config.techStack)) {
    const nativeDescriptions = {
      '/security-audit':
        'Entitlements, Keychain usage, TCC permissions, input validation, code signing',
      '/perf-audit': 'Memory profiling, main thread blocking, energy impact, serial operations',
    };
    for (const [skill, desc] of Object.entries(nativeDescriptions)) {
      content = content.replace(
        new RegExp(`(\\| \`${skill.replace('/', '\\/')}\` \\| ).*?( \\|)`),
        `$1${desc}$2`,
      );
    }
  }

  await fs.writeFile(cheatPath, content);
}

/**
 * Patch settings.json permissions.allow to use stack-appropriate CLI tools.
 * Default templates use node/npm/npx - this replaces them for non-JS stacks.
 */
async function patchSettingsPermissions(targetDir, config) {
  const settingsPath = path.join(targetDir, '.claude', 'settings.json');
  if (!(await fs.pathExists(settingsPath))) return;

  const permissionsAllowByStack = {
    swift: ['Bash(git:*)', 'Bash(swift:*)', 'Bash(xcodebuild:*)', 'Bash(xcrun:*)', 'Bash(curl:*)'],
    kotlin: ['Bash(git:*)', 'Bash(./gradlew:*)', 'Bash(gradle:*)', 'Bash(curl:*)'],
    rust: ['Bash(git:*)', 'Bash(cargo:*)', 'Bash(rustc:*)', 'Bash(curl:*)'],
    dotnet: ['Bash(git:*)', 'Bash(dotnet:*)', 'Bash(curl:*)'],
    java: ['Bash(git:*)', 'Bash(mvn:*)', 'Bash(./gradlew:*)', 'Bash(gradle:*)', 'Bash(curl:*)'],
    ruby: ['Bash(git:*)', 'Bash(bundle:*)', 'Bash(rails:*)', 'Bash(rake:*)', 'Bash(curl:*)'],
    go: ['Bash(git:*)', 'Bash(go:*)', 'Bash(curl:*)'],
    python: [
      'Bash(git:*)',
      'Bash(python:*)',
      'Bash(pip:*)',
      'Bash(uv:*)',
      'Bash(pytest:*)',
      'Bash(mypy:*)',
      'Bash(uvicorn:*)',
      'Bash(alembic:*)',
      'Bash(curl:*)',
    ],
  };

  const denyByStack = {
    swift: ['Bash(xcodebuild archive*)', 'Bash(xcrun altool --upload-app*)'],
    kotlin: ['Bash(./gradlew publish*)', 'Bash(gradle publish*)'],
    rust: ['Bash(cargo publish*)'],
    dotnet: ['Bash(dotnet nuget push*)'],
    java: ['Bash(mvn deploy*)', 'Bash(./gradlew publish*)', 'Bash(gradle publish*)'],
    ruby: ['Bash(gem push*)'],
    python: ['Bash(twine upload*)', 'Bash(alembic downgrade base*)'],
  };

  const stackPerms = permissionsAllowByStack[config.techStack];
  const stackDeny = denyByStack[config.techStack];
  if (!stackPerms && !stackDeny) return; // default node/npm/npx already in template

  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    const settings = JSON.parse(raw);
    if (stackPerms && settings.permissions && Array.isArray(settings.permissions.allow)) {
      settings.permissions.allow = stackPerms;
    }
    if (stackDeny && settings.permissions && Array.isArray(settings.permissions.deny)) {
      settings.permissions.deny = [...settings.permissions.deny, ...stackDeny];
    }
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  } catch (err) {
    // Previously silent — but a scaffold that ships default JS/Node
    // permissions on a native stack because settings.json was malformed
    // is a subtle correctness failure. Surface the problem so the user
    // can fix the template or re-run with --force.
    console.warn(
      `[tierward] Warning: could not patch ${settingsPath} — ${err.message}. ` +
        `Stack-specific permissions for "${config.techStack}" were NOT applied; ` +
        `the file may be malformed JSON or read-only.`,
    );
  }
}

async function copyTemplateDir(
  srcDir,
  destDir,
  config,
  fileNameMap,
  userConfig,
  skipDirs = [],
  skipFiles = [],
) {
  if (!(await fs.pathExists(srcDir))) return;

  const entries = await fs.readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (skipDirs.includes(entry.name)) continue;
      const subSrc = path.join(srcDir, entry.name);
      const subDest = path.join(destDir, entry.name);
      await copyTemplateDir(subSrc, subDest, config, {}, userConfig, [], []);
      continue;
    }

    // Skip explicitly excluded files
    if (skipFiles.includes(entry.name)) continue;

    // Map filename if needed
    const destName = fileNameMap[entry.name] || entry.name;

    // Skip github files if user opted out
    if (
      !userConfig.includeGithub &&
      (destName.startsWith('.github/') ||
        destName === 'CODEOWNERS' ||
        destName === 'PULL_REQUEST_TEMPLATE.md')
    ) {
      continue;
    }

    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, destName);

    await fs.ensureDir(path.dirname(dest));

    const content = await fs.readFile(src, 'utf8');
    await fs.writeFile(dest, interpolate(content, config));
  }
}

/**
 * Scaffold a tier's template files into the target directory - safe mode.
 * Same as scaffoldTier but skips files that already exist at the target path.
 * Used for in-place and from-context init modes to avoid overwriting the user's existing files.
 */
export async function scaffoldTierSafe(tier, targetDir, config, templatesDir) {
  const commonDir = path.join(templatesDir, 'common');
  const tierDir = path.join(templatesDir, `tier-${tier.toLowerCase()}`);

  await copyTemplateDirSafe(
    commonDir,
    targetDir,
    config,
    {
      gitignore: '.gitignore',
      'pre-commit-config.yaml': '.pre-commit-config.yaml',
      'adr-template.md': 'docs/adr/template.md',
      'PULL_REQUEST_TEMPLATE.md': '.github/PULL_REQUEST_TEMPLATE.md',
      CODEOWNERS: '.github/CODEOWNERS',
      'context-review.md': '.claude/rules/context-review.md',
      'files-guide.md': '.claude/files-guide.md',
      'pipeline-standards.md': 'docs/pipeline-standards.md',
      'claudemd-standards.md': 'docs/claudemd-standards.md',
      'model-effort-policy.md': 'docs/model-effort-policy.md',
    },
    config,
    ['rules'],
  );

  // CLAUDE.md is skipped - generated separately by generateClaudeMd()
  if (await fs.pathExists(tierDir)) {
    await copyTemplateDirSafe(tierDir, targetDir, config, {}, config, [], ['CLAUDE.md']);
  }

  const commonRulesDir = path.join(commonDir, 'rules');
  if (await fs.pathExists(commonRulesDir)) {
    const securityVariant = securityRuleVariant(config);
    const rules = await fs.readdir(commonRulesDir);
    for (const rule of rules) {
      if (rule.startsWith('security')) {
        if (rule === securityVariant) {
          const dest = path.join(targetDir, '.claude', 'rules', 'security.md');
          if (await fs.pathExists(dest)) continue;
          const src = path.join(commonRulesDir, rule);
          await fs.ensureDir(path.dirname(dest));
          const content = await fs.readFile(src, 'utf8');
          await fs.writeFile(dest, interpolate(content, config));
        }
        continue;
      }
      const src = path.join(commonRulesDir, rule);
      const dest = path.join(targetDir, '.claude', 'rules', rule);
      if (await fs.pathExists(dest)) continue;
      await fs.ensureDir(path.dirname(dest));
      const content = await fs.readFile(src, 'utf8');
      await fs.writeFile(dest, interpolate(content, config));
    }
  }

  await fs.ensureDir(path.join(targetDir, '.claude', 'session'));
  await fs.ensureDir(path.join(targetDir, 'docs', 'adr'));

  if (!config.includePreCommit) {
    await fs.remove(path.join(targetDir, '.pre-commit-config.yaml'));
  }
  if (!config.includeGithub) {
    await fs.remove(path.join(targetDir, '.github'));
  }

  if (tier === 'm' || tier === 'l') {
    await pruneConditionalDocs(targetDir, config);
    await pruneSkills(targetDir, config);
    await pruneCheatsheet(targetDir, config);
  } else if (tier === 's') {
    await pruneSkills(targetDir, config);
  }

  // Post-process settings.json: replace default permissions.allow with stack-aware permissions
  await patchSettingsPermissions(targetDir, config);
}

async function copyTemplateDirSafe(
  srcDir,
  destDir,
  config,
  fileNameMap,
  userConfig,
  skipDirs = [],
  skipFiles = [],
) {
  if (!(await fs.pathExists(srcDir))) return;

  const entries = await fs.readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (skipDirs.includes(entry.name)) continue;
      const subSrc = path.join(srcDir, entry.name);
      const subDest = path.join(destDir, entry.name);
      await copyTemplateDirSafe(subSrc, subDest, config, {}, userConfig, [], []);
      continue;
    }

    // Skip explicitly excluded files
    if (skipFiles.includes(entry.name)) continue;

    const destName = fileNameMap[entry.name] || entry.name;

    if (
      !userConfig.includeGithub &&
      (destName.startsWith('.github/') ||
        destName === 'CODEOWNERS' ||
        destName === 'PULL_REQUEST_TEMPLATE.md')
    ) {
      continue;
    }

    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, destName);

    // Safe mode: skip if file already exists
    if (await fs.pathExists(dest)) continue;

    await fs.ensureDir(path.dirname(dest));
    const content = await fs.readFile(src, 'utf8');
    await fs.writeFile(dest, interpolate(content, config));
  }
}

/**
 * Replace template placeholders with actual values from config.
 */
/**
 * Select the security.md variant based on stack family.
 * Returns the filename of the variant to use (e.g. 'security-native-apple.md').
 * The base 'security.md' is the web default and is used when no variant matches.
 */
function securityRuleVariant(config) {
  if (config.techStack === 'swift') return 'security-native-apple.md';
  if (config.techStack === 'kotlin') return 'security-native-android.md';
  const systemsStacks = ['rust', 'dotnet', 'java', 'go'];
  if (systemsStacks.includes(config.techStack) && config.hasApi === false) {
    return 'security-systems.md';
  }
  // Web default: node-ts, node-js, python, ruby, go (with API), dotnet (with API), java (with API), other
  return 'security.md';
}

function frameworkValue(config) {
  if (config.framework) return config.framework;
  if (NATIVE_STACKS.includes(config.techStack)) return 'N/A - native app';
  const examples = {
    'node-ts': 'Next.js 15, Express, Fastify, NestJS, Hono',
    'node-js': 'Next.js 15, Express, Fastify, NestJS, Hono',
    python: 'FastAPI, Django, Flask, Litestar',
    go: 'Gin, Echo, Fiber, Chi',
    ruby: 'Rails, Sinatra, Hanami',
  };
  const eg = examples[config.techStack] || 'Next.js 15, Express, Django, Rails';
  return `_fill in: e.g. ${eg}_`;
}

function languageFromStack(techStack) {
  const map = {
    'node-ts': 'TypeScript',
    'node-js': 'JavaScript',
    python: 'Python',
    go: 'Go',
    swift: 'Swift',
    kotlin: 'Kotlin',
    rust: 'Rust',
    dotnet: 'C#',
    ruby: 'Ruby',
    java: 'Java',
  };
  return map[techStack] || '[TypeScript / Python / Go / etc.]';
}

function enumCaseConvention(techStack) {
  const map = {
    swift: 'camelCase',
    kotlin: 'camelCase',
    rust: 'PascalCase',
  };
  return map[techStack] || 'UPPER_SNAKE_CASE';
}

/**
 * Stack-specific profiling tool names for perf-audit native path.
 */
const perfToolByStack = {
  swift: 'Instruments (Time Profiler, Allocations, Energy Diagnostics)',
  kotlin: 'Android Studio Profiler (CPU, Memory, Energy) + LeakCanary',
  rust: 'cargo bench + cargo flamegraph + criterion',
  go: 'pprof + trace + go test -bench',
  python: 'cProfile + py-spy + memory_profiler',
  ruby: 'rack-mini-profiler + stackprof + derailed_benchmarks',
  java: 'JProfiler / VisualVM + JMH benchmarks',
  dotnet: 'dotTrace + BenchmarkDotNet + PerfView',
};

/**
 * Stack-specific profiling commands for perf-audit native path.
 */
const profilerCommandByStack = {
  swift: 'xcrun xctrace record --template "Time Profiler" --launch -- ./build/MyApp',
  kotlin: './gradlew benchmark  # or Android Studio Profiler via IDE',
  rust: 'cargo bench && cargo flamegraph -- target/release/my_binary',
  go: 'go test -bench=. -benchmem -cpuprofile=cpu.prof ./... && go tool pprof cpu.prof',
  python:
    'python -m cProfile -o profile.out main.py && py-spy record -o flamegraph.svg -- python main.py',
  ruby: 'STACKPROF=1 bundle exec rspec && stackprof tmp/stackprof-*.dump --text',
  java: 'java -jar target/benchmarks.jar  # JMH benchmark runner',
  dotnet: 'dotnet run -c Release --project Benchmarks/',
};

/**
 * Stack-specific lint/analysis commands for skill-dev.
 */
const lintCommandByStack = {
  swift: 'swiftlint lint --strict',
  kotlin: './gradlew detekt',
  rust: 'cargo clippy -- -W clippy::all',
  go: 'go vet ./... && staticcheck ./...',
  python: 'ruff check . && mypy .',
  ruby: 'bundle exec rubocop',
  java: 'mvn spotbugs:check',
  dotnet: 'dotnet format --verify-no-changes',
  'node-ts': 'npx eslint .',
  'node-js': 'npx eslint .',
};

/**
 * Stack-specific security checklist items for security-audit native supplement.
 */
const securityChecklistByStack = {
  swift: `- Keychain API usage - no UserDefaults for secrets or tokens
- App Transport Security (ATS) - no blanket NSAllowsArbitraryLoads
- Data Protection API (NSFileProtectionComplete on sensitive files)
- Entitlements audit - minimal privilege, no unnecessary capabilities
- Code signing and hardened runtime enabled
- TCC permissions (camera, microphone, file access) - request only when needed`,
  kotlin: `- Android Keystore for cryptographic keys - no hardcoded secrets
- EncryptedSharedPreferences - no plaintext SharedPreferences for tokens
- Certificate pinning configuration for API connections
- ProGuard/R8 obfuscation enabled for release builds
- Content Provider permissions - exported=false by default
- WebView security - JavaScript disabled unless required, no addJavascriptInterface on untrusted content`,
  rust: `- unsafe block audit - each usage justified with a safety comment
- Memory safety - no use-after-free, double-free, or buffer overflow patterns
- cargo audit - dependency vulnerability scan
- Input validation on all FFI boundaries
- Constant-time comparison for secrets (ring or subtle crate)
- No panic in library code - use Result for error handling`,
  go: `- Input validation on all external boundaries (HTTP, CLI, file)
- Goroutine leak detection - context cancellation propagated correctly
- crypto/ stdlib usage - no custom crypto implementations
- sql.Exec with parameterized queries - no string concatenation in SQL
- govulncheck - dependency vulnerability scan
- No sensitive data in error messages or logs`,
  python: `- SQL injection - parameterized queries only, no f-strings or % formatting in SQL
- Command injection - subprocess with list args, never shell=True with user input
- Pickle deserialization - never on untrusted data
- pip-audit or safety - dependency vulnerability scan
- SSRF - validate and allowlist URLs before requests.get()
- No secrets in source - use environment variables or secret manager`,
  ruby: `- Mass assignment protection - strong parameters on all controllers
- CSRF token verification enabled (protect_from_forgery)
- Brakeman static analysis - run before each release
- SQL injection - parameterized queries, no string interpolation in where()
- bundler-audit - dependency vulnerability scan
- Secure cookie settings (httponly, secure, samesite)`,
  java: `- Deserialization safety - no ObjectInputStream on untrusted data
- SQL injection - PreparedStatement only, no string concatenation
- OWASP dependency-check - run in CI
- XML External Entity (XXE) prevention - disable external entities in parsers
- Secure random (SecureRandom, not java.util.Random for security contexts)
- No sensitive data in logs (mask PII, tokens, passwords)`,
  dotnet: `- Configuration secrets - use Secret Manager or Azure Key Vault, not appsettings.json
- Anti-forgery tokens on all state-changing endpoints
- dotnet list package --vulnerable - dependency audit
- SQL injection - parameterized queries or EF Core, no string interpolation in raw SQL
- HTTPS enforcement and HSTS header configured
- No sensitive data in exception details (ProblemDetails in production)`,
};

/**
 * Resolve dev command with awareness that empty string means "user explicitly skipped".
 * Prevents fallback to native defaults (e.g. `swift run`) for Xcode GUI apps.
 */
function resolveDevCommand(userCommand, nativeDefault) {
  // User provided an explicit command - use it
  if (userCommand && userCommand.trim() !== '') return userCommand;
  // User explicitly left blank (e.g. Xcode GUI app) - use a descriptive comment
  if (userCommand === '') return '# no dev server - launch from IDE';
  // No user input at all - fall back to native default or generic
  return nativeDefault || 'npm run dev';
}

/**
 * Build the [TEST_GUARD] clause for the Stop hook command.
 *
 * Returns a shell snippet that exits 0 (skips the test gate) when NONE of the
 * stack's project markers exist — i.e. an un-scaffolded greenfield project with
 * no test runner yet. Without this guard the Stop hook runs the test command on
 * an empty repo, fails, and blocks every task completion (the NF-3 deadlock).
 *
 * Stacks with no reliable single-file marker (dotnet globs, 'other') get an
 * empty guard and retain the prior always-on behaviour.
 */
export function buildTestGuard(techStack) {
  const markers = TEST_INFRA_MARKERS[techStack] || [];
  if (markers.length === 0) return '';
  const absence = markers.map((m) => `[ ! -f ${m} ]`).join(' && ');
  return `${absence} && exit 0; `;
}

function resolveE2eToolName(config) {
  if (
    config.e2eCommand &&
    config.e2eCommand.trim() !== '' &&
    config.e2eCommand !== '# not configured'
  ) {
    return config.e2eCommand.split(/\s/)[0]; // e.g. 'playwright' from 'playwright test'
  }
  const nativeTools = {
    swift: 'XCUITest',
    kotlin: 'Espresso',
    rust: 'integration tests',
    dotnet: 'UI tests',
    java: 'integration tests',
  };
  return nativeTools[config.techStack] || 'Playwright/Cypress';
}

function interpolate(content, config) {
  const techStackLabels = {
    'node-ts': 'Node.js + TypeScript',
    'node-js': 'Node.js + JavaScript',
    python: 'Python',
    go: 'Go',
    swift: 'Swift / macOS',
    kotlin: 'Kotlin / Android',
    rust: 'Rust',
    dotnet: '.NET / C#',
    ruby: 'Ruby',
    java: 'Java',
    other: 'Mixed',
  };

  const ncd = STACK_COMMANDS[config.techStack] || {};
  // Swift xcodebuild commands need -scheme to target the correct scheme
  const swiftScheme =
    config.techStack === 'swift' && config.projectName ? ` -scheme ${config.projectName}` : '';

  let result = content
    .replace(/\[PROJECT_NAME\]/g, config.projectName || 'My Project')
    .replace(
      /\[TECH_STACK_SUMMARY\]/g,
      techStackLabels[config.techStack] || config.techStack || 'Mixed',
    )
    .replace(
      /\[TYPE_CHECK_COMMAND\]/g,
      config.typeCheckCommand || ncd.typeCheckPlaceholder || 'npx tsc --noEmit',
    )
    .replace(/\[TEST_GUARD\]/g, buildTestGuard(config.techStack))
    .replace(
      /\[TEST_COMMAND\]/g,
      config.testCommand || (ncd.test ? ncd.test + swiftScheme : '') || 'npm test',
    )
    .replace(
      /\[BUILD_COMMAND\]/g,
      config.buildCommand || (ncd.build ? ncd.build + swiftScheme : '') || 'npm run build',
    )
    .replace(/\[DEV_COMMAND\]/g, resolveDevCommand(config.devCommand, ncd.dev))
    .replace(/\[INSTALL_COMMAND\]/g, config.installCommand || ncd.install || 'npm install')
    .replace(/\[TECH_LEAD\]/g, config.techLead || 'tech-lead')
    .replace(/\[BACKEND_LEAD\]/g, config.backendLead || 'backend-lead')
    .replace(/\[SECURITY_REVIEWER\]/g, config.securityReviewer || 'security-reviewer')
    .replace(/\[E2E_COMMAND\]/g, config.e2eCommand || '# not configured')
    .replace(/\[E2E_TOOL_NAME\]/g, resolveE2eToolName(config))
    .replace(
      /\[FRAMEWORK\]/g,
      // Note: 'java' intentionally omitted here — Java Spring/Quarkus are
      // common server-side web frameworks, so java should fall through to
      // the hasFrontend branch rather than auto-resolving to 'N/A - native app'.
      NATIVE_STACKS.filter((s) => s !== 'java').includes(config.techStack)
        ? 'N/A - native app'
        : config.hasFrontend === false
          ? 'N/A - no web frontend'
          : 'your frontend framework',
    )
    .replace(
      /\[SITEMAP_OR_ROUTE_LIST\]/g,
      config.hasFrontend === false || NATIVE_STACKS.includes(config.techStack)
        ? 'N/A - no web frontend'
        : 'docs/sitemap.md',
    )
    .replace(
      /\[API_TESTS_PATH\]/g,
      config.hasApi === false ? '# N/A - no API routes' : 'tests/api/',
    )
    .replace(
      /\[API_ROUTES_PATH\]/g,
      config.hasApi === false ? 'N/A - no API routes' : 'src/app/api/',
    )
    .replace(
      /\[BUNDLE_TOOL\]/g,
      NATIVE_STACKS.includes(config.techStack)
        ? 'N/A - native app'
        : "your build tool's bundle analyzer",
    )
    .replace(/\[FRAMEWORK_VALUE\]/g, frameworkValue(config))
    .replace(/\[LANGUAGE_VALUE\]/g, languageFromStack(config.techStack))
    .replace(/\[ENUM_CASE_CONVENTION\]/g, enumCaseConvention(config.techStack))
    .replace(/\[MIGRATION_COMMAND\]/g, config.migrationCommand || '# not configured')
    .replace(/\[PERF_TOOL\]/g, perfToolByStack[config.techStack] || 'your platform profiler')
    .replace(
      /\[PROFILER_COMMAND\]/g,
      profilerCommandByStack[config.techStack] || '# configure profiling command for your stack',
    )
    .replace(
      /\[LINT_COMMAND\]/g,
      lintCommandByStack[config.techStack] ||
        config.lintCommand ||
        '# configure lint command for your stack',
    )
    .replace(
      /\[SECURITY_CHECKLIST_ITEMS\]/g,
      securityChecklistByStack[config.techStack] || '- Configure security checklist for your stack',
    )
    .replace(
      /\[VALIDATION_LIBRARIES\]/g,
      (() => {
        const libs = {
          'node-ts': '(Zod, Yup, Joi, class-validator)',
          'node-js': '(Zod, Yup, Joi, class-validator)',
          python: '(Pydantic - native in FastAPI)',
          go: '(go-playground/validator, ozzo-validation)',
          ruby: '(Active Model Validations, dry-validation)',
          java: '(Jakarta Bean Validation, Hibernate Validator)',
          dotnet: '(FluentValidation, Data Annotations)',
        };
        return libs[config.techStack] || '(schema validation library for your stack)';
      })(),
    )
    .replace(
      /\[TEST_CLEANUP_PATTERN\]/g,
      (() => {
        const patterns = {
          'node-ts':
            'Every test that writes to DB must clean up in `afterAll`. Use cleanup-first pattern in `beforeAll` (delete pre-existing test data before creating fixtures).',
          'node-js':
            'Every test that writes to DB must clean up in `afterAll`. Use cleanup-first pattern in `beforeAll` (delete pre-existing test data before creating fixtures).',
          python:
            'Every test that writes to DB must use a fixture with cleanup. Use `yield` fixtures for teardown. Define shared fixtures in `conftest.py` with appropriate scope. Use cleanup-first pattern (delete pre-existing test data before creating fixtures).',
          go: 'Every test that writes to DB must clean up via `t.Cleanup()`. Use cleanup-first pattern (delete pre-existing test data before creating fixtures in `TestMain` or test setup).',
          ruby: 'Every test that writes to DB must clean up. Use `database_cleaner` or transaction rollback strategy. Define shared setup in `rails_helper.rb` or `spec_helper.rb`.',
          java: 'Every test that writes to DB must clean up in `@AfterAll`. Use cleanup-first pattern in `@BeforeAll` (delete pre-existing test data before creating fixtures).',
          dotnet:
            'Every test that writes to DB must clean up in `[OneTimeTearDown]`. Use cleanup-first pattern in `[OneTimeSetUp]` (delete pre-existing test data before creating fixtures).',
          rust: 'Every test that writes to DB must clean up after execution. Use setup functions with explicit cleanup. Consider `sqlx::test` macro for automatic transaction rollback.',
          swift:
            'Every test that writes to DB must clean up in `tearDownWithError()`. Use cleanup-first pattern in `setUpWithError()` (delete pre-existing test data before creating fixtures).',
          kotlin:
            'Every test that writes to DB must clean up in `@AfterAll`. Use cleanup-first pattern in `@BeforeAll` (delete pre-existing test data before creating fixtures).',
        };
        return (
          patterns[config.techStack] ||
          'Every test that writes to DB must clean up after execution. Use cleanup-first pattern (delete pre-existing test data before creating fixtures).'
        );
      })(),
    )
    .replace(
      /\[COMMIT_EXAMPLES\]/g,
      (() => {
        const examples = {
          'node-ts':
            'feat(auth): add email invite flow\nfix(api): return 403 instead of 404 for unauthorized access\ndocs(adr): record decision to use Zod for validation\nchore(deps): upgrade TypeScript to 5.4\nrefactor(data): extract query helpers to data layer\ntest(auth): add integration tests for invite flow',
          'node-js':
            'feat(auth): add email invite flow\nfix(api): return 403 instead of 404 for unauthorized access\ndocs(adr): record decision to use Zod for validation\nchore(deps): upgrade Express to 5.0\nrefactor(data): extract query helpers to data layer\ntest(auth): add integration tests for invite flow',
          python:
            'feat(auth): add email invite flow\nfix(api): return 403 instead of 404 for unauthorized access\ndocs(adr): record decision to use Pydantic v2 for validation\nchore(deps): upgrade FastAPI to 0.115\nrefactor(data): extract query helpers to data layer\ntest(auth): add integration tests for invite flow',
          go: 'feat(auth): add email invite flow\nfix(api): return 403 instead of 404 for unauthorized access\ndocs(adr): record decision to use go-playground/validator\nchore(deps): upgrade Go to 1.23\nrefactor(data): extract query helpers to data layer\ntest(auth): add integration tests for invite flow',
          ruby: 'feat(auth): add email invite flow\nfix(api): return 403 instead of 404 for unauthorized access\ndocs(adr): record decision to use dry-validation\nchore(deps): upgrade Rails to 8.0\nrefactor(data): extract query helpers to data layer\ntest(auth): add integration tests for invite flow',
          swift:
            'feat(auth): add email invite flow\nfix(api): return 403 instead of 404 for unauthorized access\ndocs(adr): record decision to use Codable for serialization\nchore(deps): upgrade Swift to 6.0\nrefactor(data): extract query helpers to data layer\ntest(auth): add integration tests for invite flow',
          kotlin:
            'feat(auth): add email invite flow\nfix(api): return 403 instead of 404 for unauthorized access\ndocs(adr): record decision to use kotlinx.serialization\nchore(deps): upgrade Kotlin to 2.1\nrefactor(data): extract query helpers to data layer\ntest(auth): add integration tests for invite flow',
          rust: 'feat(auth): add email invite flow\nfix(api): return 403 instead of 404 for unauthorized access\ndocs(adr): record decision to use serde for serialization\nchore(deps): upgrade Rust edition to 2024\nrefactor(data): extract query helpers to data layer\ntest(auth): add integration tests for invite flow',
          java: 'feat(auth): add email invite flow\nfix(api): return 403 instead of 404 for unauthorized access\ndocs(adr): record decision to use Jakarta Validation\nchore(deps): upgrade Spring Boot to 3.4\nrefactor(data): extract query helpers to data layer\ntest(auth): add integration tests for invite flow',
          dotnet:
            'feat(auth): add email invite flow\nfix(api): return 403 instead of 404 for unauthorized access\ndocs(adr): record decision to use FluentValidation\nchore(deps): upgrade .NET to 9.0\nrefactor(data): extract query helpers to data layer\ntest(auth): add integration tests for invite flow',
        };
        return examples[config.techStack] || examples['node-ts'];
      })(),
    )
    .replace(
      /\[BUILD_ARTIFACTS\]/g,
      (() => {
        const artifacts = {
          'node-ts': '`dist/`, `.next/`, `node_modules/`',
          'node-js': '`dist/`, `.next/`, `node_modules/`',
          python: '`dist/`, `__pycache__/`, `*.egg-info/`, `.venv/`',
          go: '`bin/`, built binaries',
          ruby: '`tmp/`, `vendor/bundle/`',
          swift: '`.build/`, `DerivedData/`, `*.xcuserdata`',
          kotlin: '`build/`, `*.apk`, `*.aab`',
          rust: '`target/`',
          java: '`target/`, `*.class`, `*.jar`',
          dotnet: '`bin/`, `obj/`, `*.user`',
        };
        return artifacts[config.techStack] || '`dist/`, `build/`';
      })(),
    )
    .replace(
      /\[ENVIRONMENT_SETUP\]/g,
      (() => {
        const setup = {
          python: `\n**0. Set up virtual environment** (Python projects):\n\`\`\`bash\npython -m venv .venv\nsource .venv/bin/activate  # macOS/Linux\n# .venv\\Scripts\\activate   # Windows\npip install -r requirements.txt\n\`\`\`\nActivate the venv in every new terminal session before running any command.\n`,
          go: `\n**0. Download Go modules**:\n\`\`\`bash\ngo mod download\n\`\`\`\n`,
          ruby: `\n**0. Install Ruby dependencies**:\n\`\`\`bash\nbundle install\n\`\`\`\n`,
        };
        return setup[config.techStack] || '';
      })(),
    );

  // ── Post-interpolation: simplify Phase 4 when E2E is not configured ───
  if (!config.hasE2E) {
    // Phase 1 scope gate: replace the E2E conditional with a clear skip statement
    result = result.replace(
      /Also declare:.*?Phase 4 is skipped\. State this explicitly\./s,
      'Phase 4 (UAT/E2E) is **disabled** for this project - no E2E command configured. Skip Phase 4 unconditionally.',
    );
    // Phase 4 body: replace the activation check with explicit disabled notice
    result = result.replace(
      /## Phase 4 - UAT \/ E2E tests[\s\S]*?(?=## Phase 5b)/,
      `## Phase 4 - UAT / E2E tests *(disabled)*\n\n**Disabled**: no E2E test command configured. Skip this phase.\n\n`,
    );
  }

  // ── Post-interpolation: simplify Phase 3b when no API routes ───
  if (config.hasApi === false) {
    result = result.replace(
      /## Phase 3b - API integration tests[\s\S]*?(?=## Phase 4)/,
      `## Phase 3b - API integration tests *(disabled)*\n\n**Disabled**: no API routes in this project. Skip this phase.\n\n`,
    );
  }

  // ── Post-interpolation: simplify staging workflow for native stacks ───
  if (NATIVE_STACKS.includes(config.techStack)) {
    // Phase 5c: replace staging deploy with local build + smoke
    result = result.replace(
      /## Phase 5c - Staging deploy \+ smoke test[\s\S]*?(?=## Phase 5d)/,
      '## Phase 5c - Local build + smoke test\n\n' +
        '- Build the project and run it locally.\n' +
        '- Verify the main flow in 3-5 steps.\n' +
        '- Output: "smoke test OK" or describe the problem and fix before proceeding.\n\n',
    );
    // Phase 8 step 9: direct merge to main (no staging intermediate)
    result = result.replace(
      /git checkout main && git merge staging --no-ff && git push origin main/g,
      'git checkout main && git merge feature/block-name --no-ff && git push origin main',
    );
    // Cross-cutting: remove staging from branch protection rule
    result = result.replace(
      /Never commit to `main` or `staging` directly\./g,
      'Never commit to `main` directly.',
    );
    // Phase 0 branch check: remove staging
    result = result.replace(/if on `main` or `staging`, stop\./, 'if on `main`, stop.');
  }

  // ── Post-interpolation: adjust Phase 5b terminology for backend-only projects ───
  if (config.hasFrontend === false) {
    result = result.replace(
      /every UI state that must be visible/g,
      'every data state that must be verifiable',
    );
  }

  // ── Post-interpolation: prune files-guide references to non-existent docs ───
  if (result.includes('docs/prd/prd.md') && !config.hasPrd) {
    result = result.replace(/^.*docs\/prd\/prd\.md.*\n?/gm, '');
  }
  if (result.includes('docs/contracts/') && !config.hasApi) {
    result = result.replace(/^.*docs\/contracts\/.*\n?/gm, '');
  }
  if (result.includes('docs/migrations-log.md') && config.hasDatabase === false) {
    result = result.replace(/^.*docs\/migrations-log\.md.*\n?/gm, '');
  }

  // ── Post-interpolation: append stack-specific .gitignore sections ───
  const gitignoreSections = {
    swift: `
# Xcode / Swift
xcuserdata/
DerivedData/
.build/
.swiftpm/
*.xcuserstate
*.dSYM
*.ipa
*.xcarchive
Pods/
Carthage/Build/`,
    kotlin: `
# Android / Kotlin
.gradle/
build/
local.properties
*.apk
*.aab
*.iml`,
    rust: `
# Rust
target/
Cargo.lock`,
    dotnet: `
# .NET
bin/
obj/
*.user
*.suo`,
    java: `
# Java
target/
*.class
*.jar
*.war`,
    go: `
# Go
bin/`,
  };
  const gitignoreSection = gitignoreSections[config.techStack];
  if (gitignoreSection && result.includes('# Logs')) {
    result = result.replace('# Logs', gitignoreSection + '\n\n# Logs');
  }

  return result;
}

// Named export - used by generators/claude-md.js to resolve all template placeholders
export { interpolate };

// Exported for unit testing only - not part of the public API
export const _testHelpers = {
  securityRuleVariant,
  interpolate,
  pruneSkills,
  patchSettingsPermissions,
};
