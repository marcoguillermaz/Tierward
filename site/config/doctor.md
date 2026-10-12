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
- `.pre-commit-config.yaml`, when present, is valid YAML (a warning that gives the line and column of the error)

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

`init` does not add a workflow to your project. The Tierward repository has one you can copy into your `.github/workflows/`: [`tierward-verify.yml`](https://github.com/marcoguillermaz/Tierward/blob/main/.github/workflows/tierward-verify.yml) runs `doctor` on pull requests to `main`.

```yaml
# .github/workflows/tierward-verify.yml (copied from the Tierward repository)
- name: Run tierward doctor
  run: npx tierward@latest doctor --report
```

CI runners do not have Claude Code installed, so when the `CI` variable is set (GitHub Actions always sets it) a missing Claude Code CLI is a warning, not a failure.

## Fixing failures

Most `doctor` failures have a direct fix:

| Failure | Fix |
|---|---|
| `CLAUDE.md not found` | Run `npx tierward init` |
| `Stop hook missing` | Add the Stop hook to `.claude/settings.json` (see [Stop hook](./stop-hook)) |
| `[TEST_COMMAND] placeholder found` | Replace `[TEST_COMMAND]` with your actual test command |
| `timeout not set` | Add `"timeout": 300` to the Stop hook entry |
| `CODEOWNERS missing` | Create `.github/CODEOWNERS` with a rule for `.claude/` |
| `pipeline.md not found` | Re-run `npx tierward init` with Tier S or above (see [Changing tier](../guide/tiers#changing-tier)) |
