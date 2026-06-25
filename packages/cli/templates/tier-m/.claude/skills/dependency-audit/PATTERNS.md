# PATTERNS.md — `dependency-audit` per-stack classification

Reference file for the `dependency-audit` skill. Loaded conditionally when the detected stack matches one of the entries below. For other stacks, the skill body uses agnostic rules and skips this file.

The patterns are **best-effort hints** for typical project layouts in each stack; they are not hard validation. If the project is atypical, prefer the agnostic rules in `SKILL.md` and flag the deviation in the report.

---

## node-ts (TypeScript / JavaScript)

### Source-path globs for codebase grep

- App code: `src/`, `app/`, `pages/`, `lib/`, `components/`, `hooks/`, `server/`, `api/`
- Globs: `--include="*.ts"` `--include="*.tsx"` `--include="*.js"` `--include="*.jsx"` `--include="*.mjs"`
- Exclude: `node_modules/`, `dist/`, `build/`, `.next/`, `coverage/`, `.turbo/`

### Tier classification

**Tier A (safe — batch)**:
- Patch versions on any package
- Minor versions on: utility libs (`date-fns`, `clsx`, `tailwind-merge`, `class-variance-authority`, `nanoid`, `zod-validation-error`, `@hookform/error-message`)
- Icon sets: `lucide-react`, `@heroicons/*`, `react-icons`
- Generators / CLIs: `shadcn`, `tsx` (the runner), `concurrently`
- DX devDeps: `dotenv`, `tw-animate-css`, `prettier-plugin-*`

**Tier B (non-core major or friction-prone)**:
- Major: `eslint`, `eslint-config-*`, `prettier`, `vitest`, `jest`, `@playwright/test`, `@types/*`, `tsx`, `tsup`, `vite`
- Minor with friction: `react-hook-form` (subtle changes), `recharts` (formatter type changes have caused regressions historically), `tiptap` (3.x rewrites)
- Markdown / docs tooling: `remark-*`, `rehype-*`, `mdx-*`

**Tier C (core — escalate)**:
- Frameworks: `next`, `react`, `react-dom`, `astro`, `svelte`, `solid-js`, `nuxt`, `nestjs`, `express`, `fastify`, `hono`
- Language: `typescript`
- Styling: `tailwindcss`, `styled-components`, `@emotion/*`
- Validation / contracts: `zod`, `valibot`, `yup`
- Data: `@tanstack/react-table`, `@tanstack/react-query`, `swr`, `prisma`, `drizzle-orm`, `kysely`, `sequelize`, `typeorm`
- Auth: `next-auth`, `@auth/*`, `@supabase/supabase-js`, `@supabase/ssr`, `@clerk/*`, `@workos-inc/*`
- Money / external integrations: `stripe`, `@stripe/*`, `paddle`, `googleapis`, `resend`, `@sendgrid/*`, `nodemailer`
- Documents / file processing: `pdfjs-dist`, `pdf-lib`, `puppeteer`, `playwright` (runtime use, not test)

### Test baseline commands

```bash
# Detect package manager
test -f pnpm-lock.yaml && PM=pnpm || (test -f yarn.lock && PM=yarn || PM=npm)

# Type check
$PM exec tsc --noEmit 2>&1 | tail -10

# Test runner — detect from package.json scripts
$PM test --silent > /tmp/dependency-audit-test-baseline.log 2>&1
tail -10 /tmp/dependency-audit-test-baseline.log

# E2E count if Playwright is wired
ls e2e/*.spec.ts 2>/dev/null | wc -l
```

### Per-package test mapping

- Frameworks (`next`, `react`, etc.) → e2e specs + any unit test using the framework's test utilities
- ORM (`prisma`, `drizzle-orm`) → integration tests under `__tests__/api/**` or equivalent
- Styling (`tailwindcss`, `@emotion/*`) → visual baseline (Playwright screenshots) if present
- Validation (`zod`, `valibot`) → API validation tests

---

## python

### Source-path globs

- App code: `src/`, `app/`, the package directory matching `pyproject.toml` `name`
- Globs: `--include="*.py"`
- Exclude: `.venv/`, `venv/`, `__pycache__/`, `.tox/`, `dist/`, `build/`, `.eggs/`

### Tier classification

**Tier A (safe — batch)**:
- Patch versions on any package
- Minor versions on: `python-dotenv`, `pytz`, `pendulum`, `loguru`, `rich`, `typer` (additive changes), `httpx` (patch only — minor needs review)
- Lint / format tooling minor: `black`, `ruff`, `isort`

**Tier B (non-core major or friction-prone)**:
- Major: `mypy`, `pyright`, `pytest`, `pytest-asyncio`, `pytest-cov`, `tox`, `ruff` (rule-set changes)
- ML / data minor: `numpy`, `pandas`, `polars`, `scipy` (subtle dtype changes have caused regressions)
- Web framework minor: `httpx`, `requests`, `aiohttp`

**Tier C (core — escalate)**:
- Frameworks: `django`, `flask`, `fastapi`, `starlette`, `sanic`, `quart`
- Language: pyproject `python_requires`
- ORM: `sqlalchemy`, `django` ORM via Django bumps, `tortoise-orm`, `peewee`, `alembic` (migrations)
- Validation: `pydantic` (1.x → 2.x is a Tier C major migration)
- Auth: `authlib`, `python-jose`, `pyjwt`, `cryptography` (cryptographic primitives)
- Money / external: `stripe`, `boto3`, `aws-sdk`, `googleapis`, `pyzmq`
- Data clients: `psycopg2`, `psycopg`, `asyncpg`, `pymongo`, `redis`

### Test baseline commands

```bash
# Detect tooling
test -f uv.lock && PYRUN="uv run" || (test -f poetry.lock && PYRUN="poetry run" || PYRUN="python -m")

# Type check
$PYRUN mypy . 2>&1 | tail -10

# Tests
$PYRUN pytest --no-header -q > /tmp/dependency-audit-test-baseline.log 2>&1
tail -10 /tmp/dependency-audit-test-baseline.log
```

### Per-package test mapping

- Web frameworks → integration tests against the test client (`TestClient`, `Client`)
- ORM → tests using a fixtures-based test database
- Validation (`pydantic`) → schema tests
- ML libs (`numpy`, `pandas`) → numerical baseline tests if any exist; dtype-sensitive grep recommended

---

## swift

### Source-path globs

- App code: `Sources/`, `App/`, `<ModuleName>/`
- Globs: `--include="*.swift"`
- Exclude: `.build/`, `DerivedData/`, `.swiftpm/`, `Carthage/Build/`, `Pods/`

### Inventory

Swift Package Manager has no native equivalent of `npm outdated`. The skill must compose:

```bash
# List declared packages with current resolved version
swift package show-dependencies --format json > /tmp/dependency-audit-swift-deps.json 2>&1

# For each package, check the upstream Git tags via `gh api` if hosted on GitHub:
#   gh api repos/<owner>/<repo>/tags --jq '.[0:5][].name'
# Compare resolved version against the latest semver tag.

# Xcode project Package.resolved (if Xcode-driven instead of pure SPM):
test -f *.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved && \
  cat *.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved
```

Document this composition in the audit report — it's not a single command like `npm outdated`.

### Tier classification

**Tier A (safe — batch)**:
- Patch versions on any SPM dependency
- Minor versions on: utility / formatting libs (`swift-collections`, `swift-algorithms`, `swift-log`)
- Generator / DX tooling: `SwiftFormat`, `SwiftLint` patches

**Tier B (non-core major or friction-prone)**:
- Major: `SwiftLint`, `SwiftFormat`, test frameworks (`swift-testing`, third-party Quick / Nimble)
- Minor with friction: `swift-async-algorithms`, `swift-system` (low-level boundaries)

**Tier C (core — escalate)**:
- Apple platform SDKs (handled via Xcode bumps, not SPM, but worth flagging)
- Networking: `Alamofire`, `swift-nio`, `URLSession` extensions
- Persistence: `GRDB`, `SQLite.swift`, `RealmSwift`, `CoreData` adapters
- Auth: `OAuthSwift`, `KeychainAccess`, biometric wrappers
- Money / external: any payment SDK (`StripeApplePay`, `Stripe`), Firebase modules, Google Sign-In
- Crypto: `swift-crypto`, `CryptoSwift`, `RNCryptor`

### Test baseline commands

```bash
# Build + test
swift build 2>&1 | tail -10
swift test > /tmp/dependency-audit-test-baseline.log 2>&1
tail -10 /tmp/dependency-audit-test-baseline.log

# Xcode-driven projects:
# xcodebuild -scheme <Scheme> -destination 'platform=iOS Simulator,name=iPhone 15' test
```

### Per-package test mapping

- Networking → integration tests against a mock server / `URLProtocol` fixtures
- Persistence → tests against an in-memory database / temporary file
- Auth → keychain mocking + token-flow tests
- Crypto → known-answer tests if any exist

---

## go

**Manifest files**: `go.mod` (authoritative module list), `go.sum` (checksum lock).

### Outdated detection

```bash
go list -u -m -json all 2>/dev/null | jq 'select(.Update != null) | {Path, Version, Update: .Update.Version}'
```

### Tier classification

| Tier | Rule |
|---|---|
| **A** (safe batch) | Patch and minor bumps with no entry in `CHANGELOG.md` or GitHub releases tagged as breaking |
| **B** (non-core major) | Major bump for packages in `require` but not imported by >10 source files |
| **C** (core/breaking-risk) | Major bump for stdlib wrappers (`database/sql` drivers, `net/http` middleware), router (`gin`, `chi`, `echo`), ORM (`gorm`, `ent`), or any package imported in >10 source files |

### Special directives to flag

| Directive | Flag condition |
|---|---|
| `replace` | Manual override of a module version or path — review why it exists and whether it can be removed after upgrade |
| `retract` | Upstream has retracted the version in use — update immediately |
| `go 1.X` directive | Check against current stable release (`go version` in CI) — flag if more than 2 minor versions behind |

### Runtime version check

```bash
go version   # local
# Compare to: https://go.dev/dl/ (latest stable)
```

### Test baseline

```bash
go test ./... 2>&1 | tail -20
```

---

## Other stacks (fallback)

For stacks not covered above (`node-js`, `ruby`, `rust`, `kotlin`, `java`, `dotnet`, `generic`), the skill body uses the agnostic rules. The decision matrix and Tier definitions still apply; what's missing is per-stack package classification (which packages map to which Tier) and the per-stack source-path globs.

When auditing one of these stacks, the skill's report should include a footer noting:

> Stack `<name>` does not yet have curated PATTERNS.md classification rules. Falling back to agnostic rules. Tier classifications below are based on changelog-extracted breaking-change signals only, not curated package categories. Consider this a v0 audit; submit a PR adding patterns for this stack to improve confidence.

This is honest signal-to-noise rather than pretending to a precision the audit doesn't have.
