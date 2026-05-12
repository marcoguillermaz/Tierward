---
schema_version: 1
generated_at: '2026-05-11T10:00:00Z'
generated_by: context-builder
generated_by_version: 1.0.0
project:
  name: wrong-stack
  description: Stack not in enum
  mode: greenfield
stack:
  primary: cobol
commands:
  install: npm install
  test: npm test
tier:
  selected: s
  rationale: Test
scaffold_options:
  include_pre_commit: true
  include_github: false
---
