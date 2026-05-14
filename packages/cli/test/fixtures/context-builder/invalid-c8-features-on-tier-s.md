---
schema_version: 1
generated_at: '2026-05-14T18:00:00Z'
generated_by: context-builder
generated_by_version: 1.27.0
project:
  name: bad-c8
  description: features block on tier S — not allowed
  mode: greenfield
stack:
  primary: node-ts
commands:
  install: npm install
  test: npx vitest run
tier:
  selected: s
  rationale: Solo dev
scaffold_options:
  include_pre_commit: true
  include_github: false
features:
  has_api: true
---
