# Quick Start

Get Tierward running in your project in under two minutes.

## Requirements

- Node.js 22 or later
- Claude Code installed and active in your project

## Run the wizard

```bash
npx tierward init
```

The wizard detects your project state and asks a few questions: team size, tech stack, which features you have (API, database, frontend, design system). It then scaffolds the right pipeline, rules, and audit skills for your setup.

Three paths are available:

| Path | Use when |
|---|---|
| **Existing project** | Add structure to a project that already has code |
| **New project** | Starting from scratch |
| **From existing docs** | You have a spec or requirements doc; Claude reads it and populates everything |

After the wizard completes, open Claude Code. The scaffold is active immediately, no restart needed.

## What gets scaffolded

```
your-project/
├── CLAUDE.md                    # Project context
├── .claude/
│   ├── settings.json            # Permissions + Stop hook
│   ├── rules/
│   │   ├── pipeline.md          # Development workflow
│   │   ├── security.md          # Stack-aware security rules
│   │   ├── git.md               # Commit format and branch rules
│   │   └── output-style.md      # Communication rules
│   └── skills/                  # Audit skills (conditional per project)
├── .github/
│   ├── CODEOWNERS               # Protects .claude/ from unreviewed changes
│   └── PULL_REQUEST_TEMPLATE.md
└── .pre-commit-config.yaml      # Secret scanning
```

The exact files depend on your tier and project flags. Run `npx tierward doctor` after init to confirm everything is in order.

## Validate your setup

```bash
npx tierward doctor
```

Doctor runs 29 checks across your scaffold: Stop hook presence, pipeline structure, CODEOWNERS coverage, placeholder residuals, and more. It exits 0 when everything is clean.

```bash
npx tierward doctor --report   # JSON output (for CI)
npx tierward doctor --ci       # silent, exits 1 on any failure
```

## Context Builder (optional)

If you want the scaffold to come out the same way every time (or want a written record of the decisions), run `context` before `init`:

```bash
npx tierward context           # produces CONTEXT.md via interview
npx tierward init              # reads CONTEXT.md, no further prompts
npx tierward context --all     # one-shot: context then init
```

`CONTEXT.md` is a schema-validated file that covers tier, stack, team size, and all project flags. Running `init` from it bypasses the interactive wizard entirely.

## Next steps

- **[Tiers →](./tiers)** — which tier fits your team and when to upgrade
- **[Skills →](../skills/)** — full skill library
- **[Stop hook →](../config/stop-hook)** — how the enforcement mechanism works
