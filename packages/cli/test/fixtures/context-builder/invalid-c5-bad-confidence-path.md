---
schema_version: 1
generated_at: '2026-05-11T10:00:00Z'
generated_by: context-builder
generated_by_version: 1.0.0
project:
  name: bad-confidence-key
  description: confidence key not a valid dotted path
  mode: in-place
stack:
  primary: node-ts
commands:
  install: npm install
  test: npm test
tier:
  selected: s
  rationale: existing project
scaffold_options:
  include_pre_commit: true
  include_github: true
inference:
  source_files:
    - package.json
  confidence:
    project.bogus_field: high
---
