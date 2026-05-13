---
schema_version: 1
generated_at: '2026-05-11T10:00:00Z'
generated_by: context-builder
generated_by_version: 1.0.0
project:
  name: greenfield-leak
  description: Greenfield mode with sources block — must fail
  mode: greenfield
stack:
  primary: node-ts
commands:
  install: npm install
  test: npm test
tier:
  selected: s
  rationale: New
scaffold_options:
  include_pre_commit: true
  include_github: false
sources:
  primary_repo: owner/repo
---
