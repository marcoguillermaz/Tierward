/**
 * Canonical per-stack command defaults.
 *
 * Consumed by:
 *   - generators/claude-md.js  — builds the commands block rendered in
 *                                 the generated CLAUDE.md.
 *   - scaffold/index.js        — substitutes the [TYPE_CHECK_COMMAND]
 *                                 placeholder while interpolating templates.
 *
 * The two consumers share install/dev/build/test verbatim but diverge on
 * type-check rendering, so that field has two shapes:
 *
 *   typeCheck            — value rendered in CLAUDE.md commands block.
 *                          Empty string = no type-check line emitted.
 *   typeCheckPlaceholder — value substituted into the [TYPE_CHECK_COMMAND]
 *                          placeholder during template interpolation.
 *                          Native stacks use a comment explaining that
 *                          type checking is handled by the compiler.
 */

export const STACK_COMMANDS = {
  swift: {
    install: '# no install step',
    dev: 'swift run',
    build: 'xcodebuild build',
    test: 'xcodebuild test',
    typeCheck: '',
    typeCheckPlaceholder: '# type checking handled by compiler',
  },
  kotlin: {
    install: '# no install step',
    dev: './gradlew run',
    build: './gradlew build',
    test: './gradlew test',
    typeCheck: '',
    typeCheckPlaceholder: '# type checking handled by compiler',
  },
  rust: {
    install: '# no install step',
    dev: 'cargo run',
    build: 'cargo build --release',
    test: 'cargo test',
    typeCheck: '',
    typeCheckPlaceholder: '# type checking handled by compiler',
  },
  dotnet: {
    install: 'dotnet restore',
    dev: 'dotnet run',
    build: 'dotnet build',
    test: 'dotnet test',
    typeCheck: '',
    typeCheckPlaceholder: '# type checking handled by compiler',
  },
  java: {
    install: 'mvn install',
    dev: 'mvn exec:java',
    build: 'mvn package',
    test: 'mvn test',
    typeCheck: '',
    typeCheckPlaceholder: '# type checking handled by compiler',
  },
  python: {
    install: 'pip install -r requirements.txt',
    dev: '',
    build: '',
    test: 'pytest',
    typeCheck: '',
    typeCheckPlaceholder: 'mypy .',
  },
  go: {
    install: 'go mod download',
    dev: 'go run .',
    build: 'go build ./...',
    test: 'go test ./...',
    typeCheck: '',
    typeCheckPlaceholder: 'go vet ./...',
  },
  ruby: {
    install: 'bundle install',
    dev: 'rails server',
    build: '',
    test: 'bundle exec rspec',
    typeCheck: '',
    typeCheckPlaceholder: '',
  },
};

/**
 * Per-stack project markers used to detect whether test infrastructure exists.
 *
 * Consumed by scaffold/index.js to build the [TEST_GUARD] clause prepended to
 * the Stop hook command. The guard skips the test gate when NONE of a stack's
 * markers are present — i.e. an un-scaffolded greenfield project — so the Stop
 * hook no longer deadlocks before any code (and thus any test runner) exists.
 *
 * Empty array = no reliable single-file marker (dotnet uses *.csproj/*.sln
 * globs; 'other' is unknown by definition). Those stacks get no guard and keep
 * the prior always-on behaviour.
 */
export const TEST_INFRA_MARKERS = {
  'node-ts': ['package.json'],
  'node-js': ['package.json'],
  python: ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt'],
  go: ['go.mod'],
  rust: ['Cargo.toml'],
  swift: ['Package.swift'],
  kotlin: ['build.gradle', 'build.gradle.kts'],
  java: ['pom.xml', 'build.gradle'],
  dotnet: [],
  ruby: ['Gemfile'],
  other: [],
};
