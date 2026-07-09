import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { _testHelpers } from '../../src/scaffold/index.js';

const { interpolate, pruneSkills, patchSettingsPermissions } = _testHelpers;

// Helper: run interpolate on a single placeholder with given config
function interp(placeholder, config) {
  return interpolate(`${placeholder}`, config);
}

// ---------------------------------------------------------------------------
// interpolate()
// ---------------------------------------------------------------------------

describe('interpolate - tech stack labels', () => {
  const cases = [
    ['node-ts', 'Node.js + TypeScript'],
    ['node-js', 'Node.js + JavaScript'],
    ['python', 'Python'],
    ['go', 'Go'],
    ['swift', 'Swift / macOS'],
    ['kotlin', 'Kotlin / Android'],
    ['rust', 'Rust'],
    ['dotnet', '.NET / C#'],
    ['ruby', 'Ruby'],
    ['java', 'Java'],
    ['other', 'Mixed'],
  ];

  for (const [stack, label] of cases) {
    it(`maps ${stack} to "${label}"`, () => {
      assert.equal(interp('[TECH_STACK_SUMMARY]', { techStack: stack }), label);
    });
  }
});

describe('interpolate - language values', () => {
  const cases = [
    ['node-ts', 'TypeScript'],
    ['node-js', 'JavaScript'],
    ['python', 'Python'],
    ['go', 'Go'],
    ['swift', 'Swift'],
    ['kotlin', 'Kotlin'],
    ['rust', 'Rust'],
    ['dotnet', 'C#'],
    ['ruby', 'Ruby'],
    ['java', 'Java'],
  ];

  for (const [stack, lang] of cases) {
    it(`maps ${stack} to "${lang}"`, () => {
      assert.equal(interp('[LANGUAGE_VALUE]', { techStack: stack }), lang);
    });
  }

  it('returns bracketed fallback for unknown stack', () => {
    assert.equal(
      interp('[LANGUAGE_VALUE]', { techStack: 'other' }),
      '[TypeScript / Python / Go / etc.]',
    );
  });
});

describe('interpolate - native command defaults', () => {
  const nativeDefaults = {
    swift: {
      install: '# no install step',
      dev: 'swift run',
      build: 'xcodebuild build',
      test: 'xcodebuild test',
      typeCheck: '# type checking handled by compiler',
    },
    kotlin: {
      install: '# no install step',
      dev: './gradlew run',
      build: './gradlew build',
      test: './gradlew test',
      typeCheck: '# type checking handled by compiler',
    },
    rust: {
      install: '# no install step',
      dev: 'cargo run',
      build: 'cargo build --release',
      test: 'cargo test',
      typeCheck: '# type checking handled by compiler',
    },
    dotnet: {
      install: 'dotnet restore',
      dev: 'dotnet run',
      build: 'dotnet build',
      test: 'dotnet test',
      typeCheck: '# type checking handled by compiler',
    },
    java: {
      install: 'mvn install',
      dev: 'mvn exec:java',
      build: 'mvn package',
      test: 'mvn test',
      typeCheck: '# type checking handled by compiler',
    },
  };

  for (const [stack, cmds] of Object.entries(nativeDefaults)) {
    it(`${stack} uses native install command`, () => {
      assert.equal(interp('[INSTALL_COMMAND]', { techStack: stack }), cmds.install);
    });
    it(`${stack} uses native dev command`, () => {
      assert.equal(interp('[DEV_COMMAND]', { techStack: stack }), cmds.dev);
    });
    it(`${stack} uses native build command`, () => {
      assert.equal(interp('[BUILD_COMMAND]', { techStack: stack }), cmds.build);
    });
    it(`${stack} uses native test command`, () => {
      assert.equal(interp('[TEST_COMMAND]', { techStack: stack }), cmds.test);
    });
    it(`${stack} uses native type-check command`, () => {
      assert.equal(interp('[TYPE_CHECK_COMMAND]', { techStack: stack }), cmds.typeCheck);
    });
  }
});

describe('interpolate - JS fallback commands', () => {
  const jsStacks = ['node-ts', 'node-js'];

  for (const stack of jsStacks) {
    it(`${stack} falls through to npm install`, () => {
      assert.equal(interp('[INSTALL_COMMAND]', { techStack: stack }), 'npm install');
    });
    it(`${stack} falls through to npm run dev`, () => {
      assert.equal(interp('[DEV_COMMAND]', { techStack: stack }), 'npm run dev');
    });
    it(`${stack} falls through to npm run build`, () => {
      assert.equal(interp('[BUILD_COMMAND]', { techStack: stack }), 'npm run build');
    });
    it(`${stack} falls through to npm test`, () => {
      assert.equal(interp('[TEST_COMMAND]', { techStack: stack }), 'npm test');
    });
    it(`${stack} falls through to npx tsc --noEmit`, () => {
      assert.equal(interp('[TYPE_CHECK_COMMAND]', { techStack: stack }), 'npx tsc --noEmit');
    });
  }
});

describe('interpolate - python/go/ruby stack command defaults', () => {
  const stackDefaults = {
    python: {
      install: 'pip install -r requirements.txt',
      dev: '',
      build: '',
      test: 'pytest',
      typeCheck: 'mypy .',
    },
    go: {
      install: 'go mod download',
      dev: 'go run .',
      build: 'go build ./...',
      test: 'go test ./...',
      typeCheck: 'go vet ./...',
    },
    ruby: {
      install: 'bundle install',
      dev: 'rails server',
      build: '',
      test: 'bundle exec rspec',
      typeCheck: '',
    },
  };

  for (const [stack, cmds] of Object.entries(stackDefaults)) {
    it(`${stack} uses stack-specific install command`, () => {
      assert.equal(interp('[INSTALL_COMMAND]', { techStack: stack }), cmds.install);
    });
    if (cmds.dev) {
      it(`${stack} uses stack-specific dev command`, () => {
        assert.equal(interp('[DEV_COMMAND]', { techStack: stack }), cmds.dev);
      });
    } else {
      it(`${stack} dev command falls through to npm run dev`, () => {
        // empty string ncd.dev is falsy, so resolveDevCommand returns 'npm run dev'
        assert.equal(interp('[DEV_COMMAND]', { techStack: stack }), 'npm run dev');
      });
    }
    if (cmds.build) {
      it(`${stack} uses stack-specific build command`, () => {
        assert.equal(interp('[BUILD_COMMAND]', { techStack: stack }), cmds.build);
      });
    } else {
      it(`${stack} build command falls through to npm run build`, () => {
        assert.equal(interp('[BUILD_COMMAND]', { techStack: stack }), 'npm run build');
      });
    }
    it(`${stack} uses stack-specific test command`, () => {
      assert.equal(interp('[TEST_COMMAND]', { techStack: stack }), cmds.test);
    });
    if (cmds.typeCheck) {
      it(`${stack} uses stack-specific type-check command`, () => {
        assert.equal(interp('[TYPE_CHECK_COMMAND]', { techStack: stack }), cmds.typeCheck);
      });
    } else {
      it(`${stack} type-check command falls through to npx tsc --noEmit`, () => {
        assert.equal(interp('[TYPE_CHECK_COMMAND]', { techStack: stack }), 'npx tsc --noEmit');
      });
    }
  }
});

describe('interpolate - user override precedence', () => {
  it('user testCommand overrides native default', () => {
    assert.equal(interp('[TEST_COMMAND]', { techStack: 'swift', testCommand: 'pytest' }), 'pytest');
  });

  it('user buildCommand overrides JS fallback', () => {
    assert.equal(
      interp('[BUILD_COMMAND]', { techStack: 'node-ts', buildCommand: 'turbo build' }),
      'turbo build',
    );
  });

  it('user typeCheckCommand overrides native default', () => {
    assert.equal(
      interp('[TYPE_CHECK_COMMAND]', { techStack: 'rust', typeCheckCommand: 'mypy .' }),
      'mypy .',
    );
  });

  it('user devCommand overrides JS fallback', () => {
    assert.equal(
      interp('[DEV_COMMAND]', { techStack: 'python', devCommand: 'flask run' }),
      'flask run',
    );
  });

  it('user installCommand overrides native default', () => {
    assert.equal(
      interp('[INSTALL_COMMAND]', { techStack: 'java', installCommand: 'gradle deps' }),
      'gradle deps',
    );
  });
});

describe('interpolate - conditional FRAMEWORK value', () => {
  it('returns "N/A - native app" for swift', () => {
    assert.equal(interp('[FRAMEWORK]', { techStack: 'swift' }), 'N/A - native app');
  });

  it('returns "N/A - native app" for kotlin', () => {
    assert.equal(interp('[FRAMEWORK]', { techStack: 'kotlin' }), 'N/A - native app');
  });

  it('returns "N/A - native app" for rust', () => {
    assert.equal(interp('[FRAMEWORK]', { techStack: 'rust' }), 'N/A - native app');
  });

  it('returns "N/A - native app" for dotnet', () => {
    assert.equal(interp('[FRAMEWORK]', { techStack: 'dotnet' }), 'N/A - native app');
  });

  it('returns "N/A - no web frontend" when hasFrontend=false', () => {
    assert.equal(
      interp('[FRAMEWORK]', { techStack: 'node-ts', hasFrontend: false }),
      'N/A - no web frontend',
    );
  });

  it('returns generic prompt for web stack with frontend', () => {
    assert.equal(
      interp('[FRAMEWORK]', { techStack: 'node-ts', hasFrontend: true }),
      'your frontend framework',
    );
  });
});

describe('interpolate - conditional SITEMAP_OR_ROUTE_LIST', () => {
  const nativeStacks = ['swift', 'kotlin', 'rust', 'dotnet', 'java'];

  for (const stack of nativeStacks) {
    it(`returns N/A for native stack ${stack}`, () => {
      assert.equal(
        interp('[SITEMAP_OR_ROUTE_LIST]', { techStack: stack }),
        'N/A - no web frontend',
      );
    });
  }

  it('returns N/A when hasFrontend=false', () => {
    assert.equal(
      interp('[SITEMAP_OR_ROUTE_LIST]', { techStack: 'node-ts', hasFrontend: false }),
      'N/A - no web frontend',
    );
  });

  it('returns docs/sitemap.md for web stack with frontend', () => {
    assert.equal(interp('[SITEMAP_OR_ROUTE_LIST]', { techStack: 'python' }), 'docs/sitemap.md');
  });
});

describe('interpolate - conditional API placeholders', () => {
  it('API_TESTS_PATH returns "# N/A" when hasApi=false', () => {
    assert.equal(
      interp('[API_TESTS_PATH]', { techStack: 'node-ts', hasApi: false }),
      '# N/A - no API routes',
    );
  });

  it('API_TESTS_PATH returns "tests/api/" when hasApi is not false', () => {
    assert.equal(interp('[API_TESTS_PATH]', { techStack: 'node-ts' }), 'tests/api/');
  });

  it('API_ROUTES_PATH returns "N/A" when hasApi=false', () => {
    assert.equal(
      interp('[API_ROUTES_PATH]', { techStack: 'node-ts', hasApi: false }),
      'N/A - no API routes',
    );
  });

  it('API_ROUTES_PATH returns "src/app/api/" when hasApi is not false', () => {
    assert.equal(interp('[API_ROUTES_PATH]', { techStack: 'node-ts' }), 'src/app/api/');
  });
});

describe('interpolate - BUNDLE_TOOL conditional', () => {
  it('returns "N/A - native app" for swift', () => {
    assert.equal(interp('[BUNDLE_TOOL]', { techStack: 'swift' }), 'N/A - native app');
  });

  it('returns "N/A - native app" for java', () => {
    assert.equal(interp('[BUNDLE_TOOL]', { techStack: 'java' }), 'N/A - native app');
  });

  it('returns generic tool name for web stack', () => {
    assert.equal(
      interp('[BUNDLE_TOOL]', { techStack: 'node-ts' }),
      "your build tool's bundle analyzer",
    );
  });
});

describe('interpolate - skill-related placeholders', () => {
  it('PERF_TOOL returns Instruments for swift', () => {
    const result = interp('[PERF_TOOL]', { techStack: 'swift' });
    assert.ok(result.includes('Instruments'));
  });

  it('PERF_TOOL returns pprof for go', () => {
    const result = interp('[PERF_TOOL]', { techStack: 'go' });
    assert.ok(result.includes('pprof'));
  });

  it('PERF_TOOL falls back for unknown stack', () => {
    assert.equal(interp('[PERF_TOOL]', { techStack: 'other' }), 'your platform profiler');
  });

  it('PROFILER_COMMAND returns xcrun for swift', () => {
    const result = interp('[PROFILER_COMMAND]', { techStack: 'swift' });
    assert.ok(result.includes('xcrun xctrace'));
  });

  it('PROFILER_COMMAND falls back for unknown stack', () => {
    assert.equal(
      interp('[PROFILER_COMMAND]', { techStack: 'other' }),
      '# configure profiling command for your stack',
    );
  });

  it('LINT_COMMAND returns swiftlint for swift', () => {
    assert.equal(interp('[LINT_COMMAND]', { techStack: 'swift' }), 'swiftlint lint --strict');
  });

  it('LINT_COMMAND returns eslint for node-ts', () => {
    assert.equal(interp('[LINT_COMMAND]', { techStack: 'node-ts' }), 'npx eslint .');
  });

  it('LINT_COMMAND user override takes precedence', () => {
    assert.equal(
      interp('[LINT_COMMAND]', { techStack: 'other', lintCommand: 'biome check .' }),
      'biome check .',
    );
  });

  it('LINT_COMMAND falls back for unknown stack without override', () => {
    assert.equal(
      interp('[LINT_COMMAND]', { techStack: 'other' }),
      '# configure lint command for your stack',
    );
  });

  it('SECURITY_CHECKLIST_ITEMS returns Keychain for swift', () => {
    const result = interp('[SECURITY_CHECKLIST_ITEMS]', { techStack: 'swift' });
    assert.ok(result.includes('Keychain'));
  });

  it('SECURITY_CHECKLIST_ITEMS returns generic fallback for unknown stack', () => {
    assert.equal(
      interp('[SECURITY_CHECKLIST_ITEMS]', { techStack: 'other' }),
      '- Configure security checklist for your stack',
    );
  });
});

describe('interpolate - simple placeholders', () => {
  it('PROJECT_NAME uses config value', () => {
    assert.equal(
      interp('[PROJECT_NAME]', { techStack: 'node-ts', projectName: 'Acme App' }),
      'Acme App',
    );
  });

  it('PROJECT_NAME defaults to "My Project"', () => {
    assert.equal(interp('[PROJECT_NAME]', { techStack: 'node-ts' }), 'My Project');
  });

  it('TECH_LEAD uses config value', () => {
    assert.equal(interp('[TECH_LEAD]', { techStack: 'node-ts', techLead: '@alice' }), '@alice');
  });

  it('TECH_LEAD defaults to "tech-lead"', () => {
    assert.equal(interp('[TECH_LEAD]', { techStack: 'node-ts' }), 'tech-lead');
  });

  it('E2E_COMMAND defaults to "# not configured"', () => {
    assert.equal(interp('[E2E_COMMAND]', { techStack: 'node-ts' }), '# not configured');
  });

  it('MIGRATION_COMMAND defaults to "# not configured"', () => {
    assert.equal(interp('[MIGRATION_COMMAND]', { techStack: 'node-ts' }), '# not configured');
  });
});

describe('interpolate - FRAMEWORK_VALUE via frameworkValue()', () => {
  it('uses explicit framework from config', () => {
    assert.equal(
      interp('[FRAMEWORK_VALUE]', { techStack: 'node-ts', framework: 'Next.js 15' }),
      'Next.js 15',
    );
  });

  it('returns "N/A - native app" for native stacks', () => {
    for (const stack of ['swift', 'kotlin', 'rust', 'dotnet', 'java']) {
      assert.equal(interp('[FRAMEWORK_VALUE]', { techStack: stack }), 'N/A - native app');
    }
  });

  it('returns fill-in prompt for web stack without explicit framework', () => {
    assert.equal(
      interp('[FRAMEWORK_VALUE]', { techStack: 'node-ts' }),
      '_fill in: e.g. Next.js 15, Express, Fastify, NestJS, Hono_',
    );
  });

  it('returns stack-specific examples for python', () => {
    assert.equal(
      interp('[FRAMEWORK_VALUE]', { techStack: 'python' }),
      '_fill in: e.g. FastAPI, Django, Flask, Litestar_',
    );
  });

  it('returns stack-specific examples for go', () => {
    assert.equal(
      interp('[FRAMEWORK_VALUE]', { techStack: 'go' }),
      '_fill in: e.g. Gin, Echo, Fiber, Chi_',
    );
  });

  it('returns stack-specific examples for ruby', () => {
    assert.equal(
      interp('[FRAMEWORK_VALUE]', { techStack: 'ruby' }),
      '_fill in: e.g. Rails, Sinatra, Hanami_',
    );
  });
});

describe('interpolate - multiple placeholders in one string', () => {
  it('replaces all placeholders in a single pass', () => {
    const template = 'Stack: [TECH_STACK_SUMMARY], Test: [TEST_COMMAND], Name: [PROJECT_NAME]';
    const result = interpolate(template, {
      techStack: 'swift',
      projectName: 'MyApp',
    });
    assert.equal(result, 'Stack: Swift / macOS, Test: xcodebuild test -scheme MyApp, Name: MyApp');
  });

  it('replaces repeated placeholders', () => {
    const template = '[PROJECT_NAME] is [PROJECT_NAME]';
    const result = interpolate(template, { techStack: 'node-ts', projectName: 'Foo' });
    assert.equal(result, 'Foo is Foo');
  });
});

// ---------------------------------------------------------------------------
// pruneSkills()
// ---------------------------------------------------------------------------

describe('pruneSkills', () => {
  let tmpDir;
  const allSkills = [
    'api-design',
    'security-audit',
    'skill-db',
    'responsive-audit',
    'visual-audit',
    'ux-audit',
    'ui-audit',
    'perf-audit',
    'skill-dev',
  ];

  async function setupSkills(dir) {
    const skillsDir = path.join(dir, '.claude', 'skills');
    for (const skill of allSkills) {
      await fs.ensureDir(path.join(skillsDir, skill));
    }
  }

  function remaining(dir) {
    const skillsDir = path.join(dir, '.claude', 'skills');
    return fs.readdirSync(skillsDir).sort();
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tierward-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('hasApi=false removes api-design but keeps security-audit', async () => {
    await setupSkills(tmpDir);
    await pruneSkills(tmpDir, { techStack: 'node-ts', hasApi: false });
    const left = remaining(tmpDir);
    assert.ok(!left.includes('api-design'));
    assert.ok(left.includes('security-audit'));
  });

  it('hasDatabase=false removes skill-db', async () => {
    await setupSkills(tmpDir);
    await pruneSkills(tmpDir, { techStack: 'node-ts', hasDatabase: false });
    const left = remaining(tmpDir);
    assert.ok(!left.includes('skill-db'));
  });

  it('hasFrontend=false removes responsive, visual, ux, and ui audit', async () => {
    await setupSkills(tmpDir);
    await pruneSkills(tmpDir, { techStack: 'node-ts', hasFrontend: false });
    const left = remaining(tmpDir);
    assert.ok(!left.includes('responsive-audit'));
    assert.ok(!left.includes('visual-audit'));
    assert.ok(!left.includes('ux-audit'));
    assert.ok(!left.includes('ui-audit'));
  });

  it('native stack removes browser-only skills (responsive, visual, ux, accessibility)', async () => {
    await setupSkills(tmpDir);
    await pruneSkills(tmpDir, { techStack: 'swift' });
    const left = remaining(tmpDir);
    assert.ok(!left.includes('responsive-audit'));
    assert.ok(!left.includes('visual-audit'));
    assert.ok(!left.includes('ux-audit'));
    assert.ok(!left.includes('accessibility-audit'));
  });

  it('hasDesignSystem=false removes ui-audit even with frontend', async () => {
    await setupSkills(tmpDir);
    await pruneSkills(tmpDir, { techStack: 'node-ts', hasDesignSystem: false });
    const left = remaining(tmpDir);
    assert.ok(!left.includes('ui-audit'));
    // other frontend skills remain
    assert.ok(left.includes('visual-audit'));
  });

  it('all flags true + web stack removes nothing', async () => {
    await setupSkills(tmpDir);
    await pruneSkills(tmpDir, {
      techStack: 'node-ts',
      hasApi: true,
      hasDatabase: true,
      hasFrontend: true,
      hasDesignSystem: true,
    });
    const left = remaining(tmpDir);
    assert.equal(left.length, allSkills.length);
  });

  it('missing skills directory does not crash', async () => {
    // no setupSkills - dir has no .claude/skills
    await pruneSkills(tmpDir, { techStack: 'node-ts', hasApi: false });
    // should complete without error
  });

  it('combined: hasApi=false + hasFrontend=false removes both groups but keeps security-audit', async () => {
    await setupSkills(tmpDir);
    await pruneSkills(tmpDir, { techStack: 'node-ts', hasApi: false, hasFrontend: false });
    const left = remaining(tmpDir);
    assert.ok(!left.includes('api-design'));
    assert.ok(left.includes('security-audit'));
    assert.ok(!left.includes('responsive-audit'));
    assert.ok(!left.includes('visual-audit'));
    assert.ok(!left.includes('ux-audit'));
    assert.ok(!left.includes('ui-audit'));
    // non-affected skills remain
    assert.ok(left.includes('perf-audit'));
    assert.ok(left.includes('skill-dev'));
  });
});

// ---------------------------------------------------------------------------
// patchSettingsPermissions()
// ---------------------------------------------------------------------------

describe('patchSettingsPermissions', () => {
  let tmpDir;

  const baseSettings = {
    permissions: {
      allow: ['Bash(git:*)', 'Bash(npm:*)', 'Bash(npx:*)'],
      deny: ['Bash(npm publish*)'],
    },
  };

  async function writeSettings(dir, obj) {
    const settingsPath = path.join(dir, '.claude', 'settings.json');
    await fs.ensureDir(path.dirname(settingsPath));
    await fs.writeFile(settingsPath, JSON.stringify(obj, null, 2) + '\n');
  }

  async function readSettings(dir) {
    const raw = await fs.readFile(path.join(dir, '.claude', 'settings.json'), 'utf8');
    return JSON.parse(raw);
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tierward-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  // --- allow list per stack ---

  const expectedAllow = {
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

  for (const [stack, expected] of Object.entries(expectedAllow)) {
    it(`${stack} replaces allow list with stack-specific tools`, async () => {
      await writeSettings(tmpDir, baseSettings);
      await patchSettingsPermissions(tmpDir, { techStack: stack });
      const result = await readSettings(tmpDir);
      assert.deepEqual(result.permissions.allow, expected);
    });
  }

  // --- deny list per stack ---

  const expectedDenyAppended = {
    swift: ['Bash(xcodebuild archive*)', 'Bash(xcrun altool --upload-app*)'],
    kotlin: ['Bash(./gradlew publish*)', 'Bash(gradle publish*)'],
    rust: ['Bash(cargo publish*)'],
    dotnet: ['Bash(dotnet nuget push*)'],
    java: ['Bash(mvn deploy*)', 'Bash(./gradlew publish*)', 'Bash(gradle publish*)'],
    ruby: ['Bash(gem push*)'],
    python: ['Bash(twine upload*)', 'Bash(alembic downgrade base*)'],
  };

  for (const [stack, extraDeny] of Object.entries(expectedDenyAppended)) {
    it(`${stack} appends stack-specific deny entries`, async () => {
      await writeSettings(tmpDir, baseSettings);
      await patchSettingsPermissions(tmpDir, { techStack: stack });
      const result = await readSettings(tmpDir);
      // original deny entry preserved + stack-specific entries appended
      assert.deepEqual(result.permissions.deny, ['Bash(npm publish*)', ...extraDeny]);
    });
  }

  // --- no-op for JS stacks ---

  it('node-ts leaves settings unchanged', async () => {
    await writeSettings(tmpDir, baseSettings);
    await patchSettingsPermissions(tmpDir, { techStack: 'node-ts' });
    const result = await readSettings(tmpDir);
    assert.deepEqual(result.permissions.allow, baseSettings.permissions.allow);
    assert.deepEqual(result.permissions.deny, baseSettings.permissions.deny);
  });

  it('node-js leaves settings unchanged', async () => {
    await writeSettings(tmpDir, baseSettings);
    await patchSettingsPermissions(tmpDir, { techStack: 'node-js' });
    const result = await readSettings(tmpDir);
    assert.deepEqual(result.permissions.allow, baseSettings.permissions.allow);
  });

  // --- edge cases ---

  it('missing settings.json does not crash', async () => {
    // no writeSettings - file doesn't exist
    await patchSettingsPermissions(tmpDir, { techStack: 'swift' });
    // should complete without error
  });

  it('malformed JSON does not crash', async () => {
    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    await fs.ensureDir(path.dirname(settingsPath));
    await fs.writeFile(settingsPath, '{ invalid json !!!');
    // Suppress the expected warning to keep test output clean.
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      await patchSettingsPermissions(tmpDir, { techStack: 'swift' });
    } finally {
      console.warn = origWarn;
    }
    // should complete without error (catch block)
  });

  it('malformed JSON emits a console.warn surfacing the issue', async () => {
    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    await fs.ensureDir(path.dirname(settingsPath));
    await fs.writeFile(settingsPath, '{ invalid json !!!');
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (msg) => warnings.push(msg);
    try {
      await patchSettingsPermissions(tmpDir, { techStack: 'swift' });
    } finally {
      console.warn = origWarn;
    }
    assert.equal(warnings.length, 1, 'expected exactly one warning');
    assert.match(warnings[0], /could not patch/i);
    assert.match(warnings[0], /swift/i);
  });

  it('malformed JSON leaves the original file contents unchanged', async () => {
    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    await fs.ensureDir(path.dirname(settingsPath));
    const originalContent = '{ invalid json !!!';
    await fs.writeFile(settingsPath, originalContent);
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      await patchSettingsPermissions(tmpDir, { techStack: 'swift' });
    } finally {
      console.warn = origWarn;
    }
    const content = await fs.readFile(settingsPath, 'utf8');
    assert.equal(content, originalContent);
  });

  it('go has no deny list - original deny preserved without additions', async () => {
    await writeSettings(tmpDir, baseSettings);
    await patchSettingsPermissions(tmpDir, { techStack: 'go' });
    const result = await readSettings(tmpDir);
    // go has allow but no deny entry
    assert.deepEqual(result.permissions.deny, baseSettings.permissions.deny);
  });
});
