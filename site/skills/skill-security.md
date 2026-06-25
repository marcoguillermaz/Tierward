# /skill-security

> Security scan for Claude Code skills using SkillSpector. Detects 64 vulnerability patterns — prompt injection, data exfiltration, MCP tool poisoning, supply chain, taint tracking, and more — before a skill is installed. Requires Python 3.12+ with `pip install skillspector`, or Docker as a fallback.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier S · Tier L | Sonnet | `[&lt;path&gt;|--llm]` |

---

## Dove e quando

Run before publishing or distributing any Claude Code skill, especially those that invoke MCP tools or accept user-provided arguments. The 64-pattern SkillSpector scanner catches prompt injection vectors and supply-chain risks that standard code review does not check.

## Output atteso

A structured report listing each matched pattern with category (prompt injection / data exfiltration / MCP tool poisoning / supply chain), severity, file location, and remediation guidance. A typical finding: a skill that echoes unsanitized user input directly into a shell command.
