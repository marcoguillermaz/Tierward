---
name: doc-audit
description: Static documentation drift audit - relative-link resolution, code-block syntax, Tierward placeholder residuals, slash-command name match, skill-count consistency, ADR marker freshness, stack-specific doc sync (Next.js / Django / Swift).
user-invocable: true
model: sonnet
context: fork
argument-hint: [target:path:<dir>|target:file:<glob>|mode:all]
allowed-tools: Read Glob Grep Bash
---

## Scope for v1

- **Static analysis only.** Grep, file parsing, filesystem reads. Does not fetch URLs, does not run builds, does not execute code examples.
- **No auto-fix.** Produces a markdown report; corrections are proposed but never applied.
- **Live link check deferred.** HTTP/HTTPS targets are out of scope (flaky, rate-limited). Tracked as `DOC-live-links`.
- **Semantic drift deferred.** Prose obsolescence, deprecation-age reasoning, and doc-bloat judgement are judgment-heavy and out of scope for v1.

---

## Configuration (adapt before first run)

> Replace these placeholders:
> - `[DOC_PATH]` - primary location of user-facing docs (e.g. `docs/`, `documentation/`, `website/`). Always included.
> - `[README_PATH]` - repository README (usually `README.md` at project root).
> - `[ADR_PATH]` - ADR directory if present (e.g. `docs/adr/`, `docs/decisions/`). Leave empty if none.

---

## Step 0 - Target resolution

Parse `$ARGUMENTS` for a `target:` or `mode:` token.

| Pattern | Meaning |
|---|---|
| `target:path:<dir>` | Audit docs under a specific directory only (e.g. `target:path:docs/api`) |
| `target:file:<glob>` | Audit files matching the glob (e.g. `target:file:docs/**/*.md`) |
| `mode:all` / no argument | **Full audit - README, CHANGELOG, every `.md` under `[DOC_PATH]`, and ADRs under `[ADR_PATH]` if set.** |

**STRICT PARSING**: derive target ONLY from explicit text in `$ARGUMENTS`. Do NOT infer from conversation context, recent blocks, or memory.

Announce: `Running doc-audit - scope: [FULL | target: <resolved>] - stack: <pending detection>`

---

## Step 1 - Stack detection

Detect the primary stack in this priority order. First matching marker wins.

| Stack | Marker file(s) |
|---|---|
| **node-ts** | `tsconfig.json` + `package.json` |
| **node-js** | `package.json` (no `tsconfig.json`) |
| **python** | `pyproject.toml` or `requirements.txt` or `setup.py` |
| **go** | `go.mod` |
| **rust** | `Cargo.toml` |
| **swift** | `Package.swift` or `*.xcodeproj` / `*.xcworkspace` |
| **kotlin** | `build.gradle.kts` or `build.gradle` with `kotlin(` plugin |
| **dotnet** | `*.csproj` or `*.sln` |
| **ruby** | `Gemfile` |
| **java** | `pom.xml` or `build.gradle` (no Kotlin plugin) |
| **generic** | None of the above |

**Stack-specific depth** (D7 only): patterns are loaded from `PATTERNS.md` for `node-ts`, `python`, and `swift`. For every other stack, announce `Stack <name> detected - D7 stack-specific doc sync skipped; running D1-D6 universal checks.` and continue.

Update announcement: `Running doc-audit - scope: [...] - stack: <detected>`

---

## Step 2 - Doc file discovery

Collect the audit scope by this priority:

1. Explicit target from Step 0 (`target:path` / `target:file`) wins and skips the rest.
2. `[README_PATH]` if set (defaults to `README.md`).
3. `CHANGELOG.md` at repo root if present.
4. Every `*.md` and `*.mdx` under `[DOC_PATH]` (default `docs/`), excluding `node_modules/`, `dist/`, `build/`, `.next/`, `target/`, `vendor/`, and any path matched by `.gitignore`.
5. Every `*.md` under `[ADR_PATH]` if set.

Announce: `Discovered N documentation files. Auditing: <scope>`

If `N == 0` and no target was passed: output `No documentation files found. Set [DOC_PATH] in Configuration or pass target:file:<glob>.` and exit.

---

## Step 3 - D1-D7 static checks

Run each check below against the files from Step 2. Record findings with SEVERITY / ID / FILE:LINE / EVIDENCE / IMPACT / FIX.

### D1 - Relative-link resolution

**Critical if a link points to a file that governs user-visible flow (`CONTRIBUTING.md`, `SECURITY.md`, a referenced guide); High otherwise.** Broken relative links misdirect readers.

Grep each doc for markdown link targets that do not start with `http://`, `https://`, `mailto:`, `#`, or `<`: pattern `\]\(([./][^)#]+)(?:#[^)]*)?\)`. For each match, resolve the target relative to the file's directory and check `fs.existsSync`. Skip targets that are image placeholders (`![...](...)`) only if they match `\.(png|jpg|jpeg|gif|svg|webp)$` **and** the file exists in a common asset directory - otherwise flag as D1.

Report: each broken link with `FILE:LINE - [link text] -> <target> (not found)`.

### D2 - Code-block syntax validity

**High per unparseable block.** Broken code blocks copied into terminals or configs fail silently until a user hits them.

Scan for fenced code blocks with a known declarative language tag: ` ```json `, ` ```yaml `, ` ```yml `, ` ```toml `. Extract the body. Parse with a stack-appropriate tool:

- `json`: `node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))"` via `Bash`, or reject on first syntax error.
- `yaml` / `yml`: `python3 -c "import sys,yaml; yaml.safe_load(sys.stdin)"` if `python3` and `pyyaml` are on PATH; else skip with `N/A - yaml parser unavailable`.
- `toml`: `python3 -c "import sys,tomllib; tomllib.loads(sys.stdin.read())"` on Python 3.11+; else skip with `N/A - toml parser unavailable`.

Skip `bash`, `sh`, `shell`, `text`, `console`, `diff`, and any unlabelled fence. Skip blocks that contain an obvious template marker (`<...>`, `[PLACEHOLDER]`, `{{...}}`) - those are illustrative, not meant to parse.

Report: each failing block with `FILE:LINE - lang=<tag> - <parser error excerpt>`.

### D3 - Tierward placeholder residuals

**High per occurrence in user-facing docs; Critical if found in `README.md`.** Placeholders shipped unfilled indicate an incomplete scaffold adoption.

The Tierward scaffold emits a **fixed set** of `[UPPERCASE]` tokens that the user is expected to resolve. Generic `[UPPERCASE]` regex would produce false positives on legitimate user conventions (`[API_KEY]`, `[YOUR_DOMAIN]`, `[FEATURE_FLAG_NAME]`). Use the pinned list from `PATTERNS.md` (agnostic section, `D3 Tierward placeholder list`):

```
[TEST_COMMAND] [FRAMEWORK_VALUE] [LANGUAGE_VALUE] [INSTALL_COMMAND]
[DEV_COMMAND] [BUILD_COMMAND] [TYPE_CHECK_COMMAND] [E2E_COMMAND]
[ENUM_CASE_CONVENTION] [MIGRATION_COMMAND]
```

Grep each doc for any exact token from the list. Exclude files under `packages/cli/templates/**` (the Tierward template source itself - placeholders are intentional there).

Report: each match with `FILE:LINE - <token> - replace with concrete value`.

### D4 - Slash-command name match

**Medium per orphan reference.** Readers click / copy a skill name that does not exist in `.claude/skills/`.

Grep every doc for `/[a-z][a-z0-9-]+` occurrences inside prose (filter: must be preceded by whitespace or start-of-line and followed by a word boundary; ignore URL paths by excluding matches inside a `(...)` link target). For each unique command name, verify `.claude/skills/<name>/` exists. Allowlist Tierward CLI verbs that are not skills: `init`, `upgrade`, `doctor`, `add`, `new` (these live in `packages/cli/src/commands/`, not in `.claude/skills/`).

Report: each orphan with `FILE:LINE - /<name> - no matching skill directory`.

### D5 - Skill-count consistency

**Medium if mismatch ≤ 2; High if > 2.** A stale count signals an unmaintained README.

Grep README and `[DOC_PATH]` for numeric skill claims: `\b(\d+)\s+(audit\s+)?skills?\b`. For each match, cross-verify against the filesystem:

```bash
ls .claude/skills/ | grep -v '^custom-' | wc -l
```

If the claimed count does not match the actual directory count, flag the mismatch. Note: this check intentionally scopes to **skill count only** - doctor/test counts are source-specific to the Tierward codebase and are not in scope for user-project audits.

Report: `FILE:LINE - claim "<N> skills" - actual <M> in .claude/skills/`.

### D6 - ADR marker freshness

**Low per stale file.** Only runs if `[ADR_PATH]` is set and the directory exists.

For each `*.md` under `[ADR_PATH]`:

- Parse YAML frontmatter for a `date:` or `updated:` field.
- If the parsed date is older than 180 days AND the frontmatter `status:` field is not one of `accepted`, `deprecated`, `superseded`, `rejected`: flag as stale.

Skip files without a frontmatter date field (freshness cannot be determined).

Report: each stale file with `FILE - date: <YYYY-MM-DD> - status: <value | missing>`.

### D7 - Stack-specific doc sync

**Medium per orphan surface.** Only runs for `node-ts`, `python`, `swift` (see Step 1). Load `PATTERNS.md` → D7 section for the detected stack.

The patterns cover:

- **node-ts**: Next.js `app/` or `pages/` routes vs. mentions in `docs/sitemap.md` (if present) or README Tech Stack; `package.json` dependencies vs. README Tech Stack mentions.
- **python**: Django `urls.py` paths vs. mentions in `docs/sitemap.md` or README; `pyproject.toml` / `requirements.txt` top-level deps vs. README mentions.
- **swift**: `Package.swift` products / targets vs. README mentions; `Docs/` (DocC) presence if `Package.swift` declares `.target(...)` targets.

Stack patterns are **best-effort hints**, not hard validation. Atypical project layouts (custom routing, monorepos) may produce false positives; default severity is Medium so findings are discussable, not blocking.

Report: each orphan with `FILE:LINE - <surface> - not mentioned in docs/README`.

---

## Step 4 - Report

```
## Doc Audit - [DATE] - [SCOPE] - stack: [DETECTED]

### Executive summary
[2-5 bullets. Critical + High findings only. Concrete facts: file names, line numbers, counts.
If nothing Critical/High: state that explicitly ("No Critical or High findings - docs are consistent with the code").]

### Documentation maturity assessment
| Dimension | Rating | Notes |
|---|---|---|
| Link hygiene | strong / adequate / weak | [D1 broken link count] |
| Code-block validity | strong / adequate / weak | [D2 unparseable blocks] |
| Placeholder discipline | strong / adequate / weak | [D3 Tierward tokens remaining] |
| Skill coherence | strong / adequate / weak | [D4 orphans + D5 count mismatch] |
| ADR freshness | strong / adequate / weak | [D6 stale count; N/A if ADR_PATH unset] |
| Stack sync | strong / adequate / weak | [D7 orphans; N/A for non-top-3 stacks] |
| Release readiness | ready / conditional / blocked | [blocked = any Critical; conditional = High findings exist] |

### Check verdicts
| # | Check | Verdict | Findings |
|---|---|---|---|
| D1 | Relative-link resolution | ✅/⚠️ | [N broken] |
| D2 | Code-block syntax | ✅/⚠️ | [N unparseable] |
| D3 | Tierward placeholder residuals | ✅/⚠️ | [N occurrences] |
| D4 | Slash-command name match | ✅/⚠️ | [N orphans] |
| D5 | Skill-count consistency | ✅/⚠️ | [mismatch or OK] |
| D6 | ADR marker freshness | ✅/⚠️ / N/A | [N stale; N/A if no ADR_PATH] |
| D7 | Stack-specific doc sync | ✅/⚠️ / N/A | [N orphans; N/A for non-top-3] |

### Prioritized findings
For each finding with severity Medium or above:
[SEVERITY] [ID] [check] - [file:line] - [evidence excerpt] - [impact] - [fix] - [effort: S=<1h / M=half day / L=day+]

### Quick wins
[Findings that meet all three: (a) Medium or High, (b) effort S, (c) single-file fix]
Format: "DOC-[n]: [one-line description]"
If no quick wins: state explicitly.
```

---

## Step 5 - Backlog decision gate

Present all findings with severity Medium or above as a numbered decision list, sorted Critical → High → Medium:

```
Found N findings at Medium or above. Which to add to backlog?

[1] [CRITICAL] DOC-? - file:line - one-line description
[2] [HIGH]     DOC-? - file:line - one-line description
[3] [MEDIUM]   DOC-? - file:line - one-line description
...

Reply with numbers to include (e.g. "1 2 4"), "all", or "none".
```

**Wait for explicit user response before writing anything.**

Then write ONLY the approved entries to `docs/refactoring-backlog.md`:
- Assign ID: `DOC-[n]` (next available after existing DOC entries)
- Add row to priority index
- Add full detail section with: issue, evidence (file:line + excerpt), fix suggestion, effort, risk

### Severity guide

- **Critical**: broken link to a user-visible flow doc (CONTRIBUTING, SECURITY, linked guide) (D1); Tierward placeholder in `README.md` (D3)
- **High**: unparseable `json` / `yaml` / `toml` code block (D2); Tierward placeholder in any other user-facing doc (D3); skill-count mismatch > 2 (D5)
- **Medium**: orphan `/skill-name` reference (D4); skill-count mismatch ≤ 2 (D5); stack-specific orphan surface (D7); broken link to non-critical asset (D1)
- **Low**: stale ADR without terminal status (D6)

---

## Execution notes

- Do NOT modify any doc file. Audit only.
- Do NOT fetch URLs. HTTP / HTTPS link resolution is out of scope for v1.
- `target:path:<dir>` and `target:file:<glob>` bypass the default scope from Step 2.
- If git history is available, cross-reference D3 Critical findings against `git diff HEAD~1` - a placeholder on a file modified in the current block is more actionable than one left over from a prior release.
- This skill complements `/arch-audit` (governance-file compliance) and `/test-audit` (suite quality). Run in Phase 5d Track C after Phase 3 passes - drift flagged when the modification is fresh in memory beats drift caught by a new contributor six weeks later.
- After the report, ask: "Do you want me to prepare the corrections for the identified findings?" Reply with `yes` only after the user has signed off on the specific findings.

---

## Stack adaptation

D1-D6 run on every stack. D7 is stack-specific and loads patterns from `${CLAUDE_SKILL_DIR}/PATTERNS.md`:

- **node-ts**: Next.js route layout (`app/`, `pages/`) cross-referenced against `docs/sitemap.md` and README Tech Stack; `package.json` dependencies cross-referenced against README.
- **python**: Django `urls.py` paths cross-referenced against `docs/sitemap.md` and README; `pyproject.toml` / `requirements.txt` top-level deps cross-referenced against README.
- **swift**: `Package.swift` products and targets cross-referenced against README; DocC (`Docs/`) presence check for projects that declare library targets.

For `node-js`, `go`, `rust`, `kotlin`, `dotnet`, `ruby`, `java`, and `generic`: D7 is skipped. Patterns for these stacks can be added in a future release; the Step 1 announcement already tells the user D7 is not running.
