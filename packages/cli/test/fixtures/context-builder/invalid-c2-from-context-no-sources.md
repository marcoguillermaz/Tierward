---
schema_version: 1
generated_at: '2026-05-11T10:00:00Z'
generated_by: context-builder
generated_by_version: 1.0.0
project:
  name: from-context-missing
  description: Mode from-context without sources block
  mode: from-context
stack:
  primary: node-ts
commands:
  install: npm install
  test: npm test
tier:
  selected: s
  rationale: Forking
scaffold_options:
  include_pre_commit: true
  include_github: false
inference:
  source_files:
    - README.md
---
