---
schema_version: 1
generated_at: '2026-05-14T18:00:00Z'
generated_by: context-builder
generated_by_version: 1.27.0
project:
  name: tier-m-app
  description: A medium-complexity app spanning feature blocks.
  mode: greenfield
stack:
  primary: node-ts
commands:
  install: npm install
  test: npx vitest run
  type_check: npx tsc --noEmit
  dev: npm run dev
  e2e: npx playwright test
tier:
  selected: m
  rationale: Small team, feature-block work in 1-2 week chunks
scaffold_options:
  include_pre_commit: true
  include_github: true
features:
  has_api: true
  has_database: true
  has_frontend: true
  has_design_system: true
  design_system_name: shadcn/ui
  has_prd: false
audit_model: claude-sonnet-4-6
---
