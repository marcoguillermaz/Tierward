---
name: skill-security
description: Security scan for Claude Code skills using SkillSpector. Detects 64 vulnerability patterns — prompt injection, data exfiltration, MCP tool poisoning, supply chain, taint tracking, and more — before a skill is installed. Requires Python 3.12+ with `pip install skillspector`, or Docker as a fallback.
user-invocable: true
model: sonnet
context: fork
effort: medium
argument-hint: [<path>|--llm]
---

**Scope**: scan a skill package (SKILL.md + any associated scripts) for security vulnerabilities before installation. Covers 64 patterns across 16 categories using SkillSpector (NVIDIA, Apache 2.0).

**Out of scope**: application security audits (use `/security-audit` instead), scanning the project's own source code, fixing identified vulnerabilities.

**Do NOT modify any file during the scan.**

---

## Step 0 — Preflight: verify SkillSpector availability

Check availability in this order and announce which execution path will be used:

### Path A — SkillSpector (pip)

```bash
python3 --version 2>&1 | head -1
pip show skillspector 2>&1 | grep -E "^(Name|Version):"
```

If both return successfully (Python 3.12+ AND skillspector installed): proceed with **Path A**. Announce: `Using SkillSpector [version] via pip`.

### Path B — Docker fallback

If Path A is not available:

```bash
docker --version 2>&1 | head -1
docker image ls skillspector 2>&1 | grep -c skillspector
```

If Docker is available: instruct the user to build the image if not already built:

```
Docker image not found. Build it with:
  git clone https://github.com/NVIDIA/skillspector.git /tmp/skillspector
  docker build -t skillspector /tmp/skillspector
Then re-run this skill.
```

If the image exists: proceed with **Path B**. Announce: `Using SkillSpector via Docker`.

### Neither available

If neither Path A nor Path B is usable, stop and output:

```
SkillSpector is not available. Install it with one of:

  pip install skillspector          # requires Python 3.12+
  pipx install skillspector         # isolated install

Or build the Docker image:
  git clone https://github.com/NVIDIA/skillspector.git /tmp/skillspector
  docker build -t skillspector /tmp/skillspector

Then re-run: /skill-security [path]
```

Do not proceed further.

---

## Step 1 — Resolve scan target

Parse `$ARGUMENTS` for a path and the `--llm` flag.

| Argument pattern | Scan target | LLM mode |
|---|---|---|
| (none) | Current directory (`.`) | disabled |
| `./path/to/skill/` | Specified directory | disabled |
| `./SKILL.md` | Specified file | disabled |
| `--llm` | Current directory | enabled |
| `./path/to/skill/ --llm` | Specified directory | enabled |

After resolving the path, verify it exists:

```bash
ls -la <resolved_path> 2>&1 | head -5
```

If the path does not exist: stop with `Target not found: <path>. Pass a valid skill directory or SKILL.md file.`

Announce: `Scanning: <resolved_path> | LLM analysis: [enabled|disabled]`

---

## Step 2 — Execute static scan

Run the static scan (no LLM) using the available execution path. Capture JSON output for structured parsing.

### Path A (pip)

```bash
skillspector scan <resolved_path> --no-llm --format json 2>&1
```

### Path B (Docker)

```bash
docker run --rm -v "$PWD:/scan" skillspector scan <resolved_path> --no-llm --format json 2>&1
```

If the command exits with code 2 (error): report the stderr output and stop. A code 1 means risk_score > 50 and is expected — do not treat it as an error.

Store the JSON output for Step 4 parsing.

---

## Step 3 — LLM analysis (opt-in)

**Only run this step if `--llm` was passed in $ARGUMENTS.**

Check if an LLM provider credential is available:

```bash
echo ${ANTHROPIC_API_KEY:+set} ${OPENAI_API_KEY:+set} 2>/dev/null
```

If `ANTHROPIC_API_KEY` is set:

```bash
SKILLSPECTOR_PROVIDER=anthropic skillspector scan <resolved_path> --format json 2>&1
```

If `OPENAI_API_KEY` is set (and no Anthropic key):

```bash
SKILLSPECTOR_PROVIDER=openai skillspector scan <resolved_path> --format json 2>&1
```

If no key is found: output a warning and proceed with the static-only results from Step 2:

```
⚠  --llm requested but no API key found.
   Set ANTHROPIC_API_KEY or OPENAI_API_KEY and re-run to enable semantic analysis.
   Showing static-only results (precision may be lower).
```

Replace the Step 2 JSON output with the LLM-enhanced JSON if the LLM scan succeeded.

---

## Step 4 — Present report

Parse the JSON output and present the report in this format. Use the actual values from the JSON fields `risk_score`, `risk_severity`, `risk_recommendation`, and `filtered_findings` (or `findings` if `filtered_findings` is absent).

---

```
## Skill Security Report

Skill:       <basename of resolved_path>
Source:      <resolved_path>
Analysis:    [Static only | Static + LLM (claude-opus-4-6)]

Risk Score:  <risk_score>/100
Severity:    <risk_severity>
Verdict:     <risk_recommendation>
```

### Severity badge

| risk_severity | Display |
|---|---|
| LOW | `✅ LOW — SAFE TO INSTALL` |
| MEDIUM | `⚠️  MEDIUM — REVIEW BEFORE INSTALLING` |
| HIGH | `🔴 HIGH — DO NOT INSTALL` |
| CRITICAL | `🚨 CRITICAL — DO NOT INSTALL` |

### Findings (group by severity: CRITICAL → HIGH → MEDIUM → LOW)

For each finding in the JSON array, output:

```
[SEVERITY] <rule_id> — <message>
  Location:    <file>:<start_line>
  Confidence:  <confidence as percentage>%
  Finding:     <finding (matched snippet, if present)>
  Explanation: <explanation>
  Remediation: <remediation>
```

If there are zero findings: output `No security issues detected.`

### Score breakdown

Explain the score only when risk_score > 0:

```
Score breakdown:
  CRITICAL issues × 50pts: <count>
  HIGH issues × 25pts:     <count>
  MEDIUM issues × 10pts:   <count>
  LOW issues × 5pts:       <count>
  Script multiplier (1.3×): [applied|not applied]
```

---

### Closing

If `risk_recommendation` is `DO NOT INSTALL`:

```
⛔ This skill has a risk score of <risk_score>/100 and should NOT be installed.
   Address all CRITICAL and HIGH findings before using it.
```

If `risk_recommendation` is `CAUTION`:

```
⚠️  Review the findings above before installing this skill.
   Run with --llm for deeper semantic analysis (reduces false positives to ~13%).
```

If `risk_recommendation` is `SAFE`:

```
✅ This skill passed the security scan. Safe to install.
   Tip: run with --llm for semantic analysis if the skill includes executable code.
```
