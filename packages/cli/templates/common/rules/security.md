# Security Rules

These rules apply to any code handling untrusted input, authentication, or data access.

## Authentication

- Verify caller identity before any operation. Never trust client-supplied user IDs.
- The auth check must be the **first** operation at every entry point that performs a privileged action - before data access, before validation.
- Distinguish "not authenticated" from "not authorized" (e.g. in HTTP, 401 vs 403). Never signal that a resource does not exist to hide an authorization failure (e.g. never return 404 in place of 403).

## Input Validation

- Validate all inputs at system boundaries (API routes, webhooks, form submissions, IPC, CLI arguments).
- Use a schema validation library [VALIDATION_LIBRARIES] - never manual `if` chains.
- Reject requests with unexpected fields (strict parsing, not passthrough).
- IDs and typed values from external input must be validated against their expected type before use in queries.

## Database

- Never interpolate user input directly into SQL strings. Use parameterized queries / ORM methods.
- Confirm that new tables have row-level access control enabled (e.g., PostgreSQL RLS, application-level guards).
- Never expose raw DB errors to clients - log internally, return generic message.
- Before using a column name from user input in a query, validate it against an allowlist.

## Responses / Output

- Never return password hashes, tokens, internal IDs (unless required), or PII beyond what the requester is authorized to see.
- Error messages must not reveal system internals (stack traces, query structure, file paths).
- Sensitive operations (delete, state change, privilege escalation) must require explicit confirmation in the request payload - never from a read-only request.

## Secrets and Credentials

- Never hardcode secrets, tokens, passwords, or connection strings. Use environment variables.
- Never log secrets, even at debug level.
- `.env*` files must be in `.gitignore`. Verify before committing.

## Security Checklist (before every commit touching auth, data access, or external input)

- [ ] Auth check before any data operation
- [ ] All inputs validated with schema library
- [ ] No sensitive data in responses
- [ ] No raw DB errors exposed to client
- [ ] No secrets in code or logs
- [ ] Row-level access control not implicitly bypassed
