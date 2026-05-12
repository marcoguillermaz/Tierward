---
schema_version: 1
generated_at: '2026-05-11T10:00:00Z'
generated_by: context-builder
generated_by_version: 1.0.0
project:
  name: demo-app
  description: A simple task tracker for a 3-person team.
  mode: greenfield
stack:
  primary: node-ts
commands:
  install: npm install
  test: npx vitest run
  type_check: npx tsc --noEmit
  dev: npm run dev
tier:
  selected: s
  rationale: Solo developer, bugfixes and small features
scaffold_options:
  include_pre_commit: true
  include_github: false
---

# Project Context

## What we are building

A simple task tracker.

## Operational constraints

2-month deadline.

## Open questions

None yet.
