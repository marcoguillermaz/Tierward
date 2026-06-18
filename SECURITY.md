# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.x | ✅ Yes |
| < 1.0 | ❌ No |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

To report a security issue, use [GitHub's private vulnerability reporting](https://github.com/marcoguillermaz/tierward/security/advisories/new).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You will receive a response within 5 business days. If the issue is confirmed, a fix will be released as soon as possible.

## Scope

This project is a CLI scaffold tool. Relevant security concerns include:

- **Secret exposure**: the `doctor` command scans for credentials in `CLAUDE.md`. Report any pattern bypass.
- **Command injection**: the Stop hook executes a user-defined command. Report any injection vector.
- **Template content**: report if any scaffolded file could introduce a vulnerability into a user's project.
- **Dependency vulnerabilities**: report known CVEs in dependencies (`commander`, `inquirer`, `chalk`, `ora`, `fs-extra`).
