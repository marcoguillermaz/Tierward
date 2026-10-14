# /api-contract-audit

> Static OpenAPI contract audit - endpoint drift (spec vs code), schema drift, status-code mismatch, breaking-change detection vs previous spec version, versioning consistency, security scheme alignment, deprecation markers, Richardson Maturity L0-L3 scoring. Framework auto-gen for FastAPI, NestJS, Express+swagger-jsdoc, Next.js route handlers, Django REST.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Sonnet | `[target:spec:<path>\|target:endpoint:<path>\|mode:drift\|mode:richardson\|mode:all]` |

---

## When to use

Run before merging a PR that changes any API handler, or after auto-generating a new OpenAPI spec, to confirm the spec matches the implementation and no breaking changes are introduced for existing consumers. Richardson Maturity scoring gives a quick read on API quality without a full review.

## Expected output

A drift report listing endpoints present in code but absent from the spec, breaking changes flagged by type (removed field, changed type, new required parameter), and an overall Richardson Maturity level from L0 to L3. A typical finding: a required query parameter added to an existing endpoint without a corresponding spec update.
