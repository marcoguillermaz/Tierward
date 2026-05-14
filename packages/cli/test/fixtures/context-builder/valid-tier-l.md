---
schema_version: 1
generated_at: '2026-05-14T18:00:00Z'
generated_by: context-builder
generated_by_version: 1.27.0
project:
  name: tier-l-app
  description: A large-scope project with long-running complexity.
  mode: greenfield
stack:
  primary: python
commands:
  install: pip install -r requirements.txt
  test: pytest
tier:
  selected: l
  rationale: Larger team, complex domain changes
scaffold_options:
  include_pre_commit: true
  include_github: true
features:
  has_api: true
  has_database: true
  has_frontend: false
  has_prd: true
---
