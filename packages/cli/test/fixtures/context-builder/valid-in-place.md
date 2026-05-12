---
schema_version: 1
generated_at: '2026-05-11T10:00:00Z'
generated_by: context-builder
generated_by_version: 1.0.0
project:
  name: existing-app
  description: Inherited backend service.
  mode: in-place
stack:
  primary: python
commands:
  install: pip install -r requirements.txt
  test: pytest
  type_check: null
  dev: uvicorn main:app --reload
tier:
  selected: s
  rationale: Small team, bugfix-oriented work
scaffold_options:
  include_pre_commit: true
  include_github: true
inference:
  source_files:
    - requirements.txt
    - main.py
    - README.md
  confidence:
    stack.primary: high
    commands.test: high
    commands.dev: medium
pending_decisions: []
---

# Project Context

## What we are building

Backend.
