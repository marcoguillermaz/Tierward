---
schema_version: 1
generated_at: '2026-05-11T10:00:00Z'
generated_by: context-builder
generated_by_version: 1.0.0
project:
  name: inplace-no-inference
  description: in-place without inference block
  mode: in-place
stack:
  primary: python
commands:
  install: pip install -r requirements.txt
  test: pytest
tier:
  selected: s
  rationale: Existing python project
scaffold_options:
  include_pre_commit: true
  include_github: true
---
