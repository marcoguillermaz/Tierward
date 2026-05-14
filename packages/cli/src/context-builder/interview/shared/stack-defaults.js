/**
 * Per-stack default commands. Shared between pm-flow and dev-flow so a
 * single source of truth feeds both interview branches.
 *
 * type_check is intentionally non-null only for stacks that have a
 * native type-check step.
 */
export const STACK_DEFAULTS = Object.freeze({
  'node-ts': {
    install: 'npm install',
    test: 'npx vitest run',
    type_check: 'npx tsc --noEmit',
    dev: 'npm run dev',
  },
  'node-js': {
    install: 'npm install',
    test: 'npm test',
    type_check: null,
    dev: 'npm run dev',
  },
  python: {
    install: 'pip install -r requirements.txt',
    test: 'pytest',
    type_check: null,
    dev: 'uvicorn main:app --reload',
  },
  go: {
    install: 'go mod download',
    test: 'go test ./...',
    type_check: null,
    dev: 'go run .',
  },
  swift: {
    install: 'swift package resolve',
    test: 'swift test',
    type_check: null,
    dev: 'swift run',
  },
  kotlin: {
    install: './gradlew dependencies',
    test: './gradlew test',
    type_check: null,
    dev: './gradlew run',
  },
  rust: {
    install: 'cargo build',
    test: 'cargo test',
    type_check: null,
    dev: 'cargo run',
  },
  dotnet: {
    install: 'dotnet restore',
    test: 'dotnet test',
    type_check: null,
    dev: 'dotnet run',
  },
  ruby: {
    install: 'bundle install',
    test: 'bundle exec rspec',
    type_check: null,
    dev: 'bundle exec rails server',
  },
  java: {
    install: 'mvn install',
    test: 'mvn test',
    type_check: null,
    dev: 'mvn exec:java',
  },
  other: {
    install: '',
    test: '',
    type_check: null,
    dev: '',
  },
});

export const TECH_STACK_CHOICES = [
  { name: 'Node.js / TypeScript', value: 'node-ts' },
  { name: 'Node.js / JavaScript', value: 'node-js' },
  { name: 'Python', value: 'python' },
  { name: 'Go', value: 'go' },
  { name: 'Swift / macOS / iOS', value: 'swift' },
  { name: 'Kotlin / Android', value: 'kotlin' },
  { name: 'Rust', value: 'rust' },
  { name: '.NET / C#', value: 'dotnet' },
  { name: 'Ruby', value: 'ruby' },
  { name: 'Java', value: 'java' },
  { name: 'Other / mixed', value: 'other' },
];

// As of v1.27.0 tier M/L are supported in the schema. The constant is
// retained as an empty array so callers that import it still find the
// export but the hard-stop no longer triggers.
export const HARD_STOP_TIERS = Object.freeze([]);
