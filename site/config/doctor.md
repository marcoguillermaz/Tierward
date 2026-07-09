# doctor

`npx tierward doctor` validates your scaffold and reports on 28 checks across four categories: scaffold presence, Stop hook configuration, pipeline structure, and CODEOWNERS coverage.

## Usage

```bash
npx tierward doctor                # human-readable output, exits 0/1
npx tierward doctor --report       # JSON output
npx tierward doctor --ci           # silent, exits 1 on any failure
```

Use `--ci` in pull request workflows to block merges when the scaffold is broken.

## What it checks

**Scaffold**
- `CLAUDE.md` exists and is under the 200-line limit
- `.claude/settings.json` exists
- `.claude/rules/` contains the expected rule files for your tier
- No unfilled `[PLACEHOLDER]` values remain in any governance file

**Stop hook**
- `settings.json` contains a `Stop` hook
- The hook command has no unfilled `[TEST_COMMAND]` placeholder
- `timeout` is set (prevents Claude from hanging on a broken test suite)

**Pipeline (Tier M/L)**
- `pipeline.md` exists in `.claude/rules/`
- STOP gate syntax is present and correct
- Phase count matches the expected tier structure

**CODEOWNERS**
- `.github/CODEOWNERS` exists
- `.claude/` path is covered by at least one owner rule

## Integrating with CI

The `tierward-verify.yml` workflow file is included in every scaffold. It runs `doctor` on every pull request targeting `main` and blocks the merge if any check fails.

```yaml
# .github/workflows/tierward-verify.yml (auto-scaffolded)
- name: Run tierward doctor
  run: npx tierward@latest doctor --report
```

If you're adding Tierward to an existing repo without the auto-scaffolded workflow, copy `tierward-verify.yml` from the [repository](https://github.com/marcoguillermaz/Tierward/blob/main/.github/workflows/tierward-verify.yml).

## Fixing failures

Most `doctor` failures have a direct fix:

| Failure | Fix |
|---|---|
| `CLAUDE.md not found` | Run `npx tierward init` |
| `Stop hook missing` | Add the Stop hook to `.claude/settings.json` (see [Stop hook](./stop-hook)) |
| `[TEST_COMMAND] placeholder found` | Replace `[TEST_COMMAND]` with your actual test command |
| `timeout not set` | Add `"timeout": 300` to the Stop hook entry |
| `CODEOWNERS missing` | Create `.github/CODEOWNERS` with a rule for `.claude/` |
| `pipeline.md not found` | Run `npx tierward upgrade --tier=m` to install the Tier M pipeline |
