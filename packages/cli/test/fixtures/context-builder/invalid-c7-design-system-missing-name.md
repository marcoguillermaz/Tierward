---
schema_version: 1
generated_at: '2026-05-14T18:00:00Z'
generated_by: context-builder
generated_by_version: 1.27.0
project:
  name: bad-c7
  description: design system flag without name
  mode: greenfield
stack:
  primary: node-ts
commands:
  install: npm install
  test: npx vitest run
tier:
  selected: m
  rationale: Small team, feature blocks
scaffold_options:
  include_pre_commit: true
  include_github: false
features:
  has_frontend: true
  has_design_system: true
---
