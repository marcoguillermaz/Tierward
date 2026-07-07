# Test Audit - Report Template

## Test Audit - [DATE] - [SCOPE] - stack: [STACK] / framework: [FRAMEWORK]

### Executive summary
[2-5 bullets - Critical and High findings only. Write concrete facts: file names, line, impact.
If nothing Critical/High: state that explicitly.
Example bullets:
- "`.only` committed in 3 files - CI is skipping all other tests (T1/T8 Critical)"
- "Line coverage is 34% overall with 12 files at 0% (C Critical)"
- "No unit tests detected; all N tests are E2E - pyramid inverted (P Major)"]

### Suite maturity assessment
| Dimension | Rating | Notes |
|---|---|---|
| Coverage | strong / adequate / weak | [total line %, files at 0%] |
| Pyramid shape | strong / adequate / weak | [unit % / integration % / e2e %] |
| Focus discipline | strong / adequate / weak | [T1+T8 count] |
| Assertion discipline | strong / adequate / weak | [T5 count] |
| Determinism | strong / adequate / weak | [T6 hardcoded sleeps] |
| Hygiene | strong / adequate / weak | [T2 skipped %, T4 empty, T7 noise] |
| Release readiness | ready / conditional / blocked | [blocked = any Critical; conditional = High findings exist] |

### Check verdicts
| # | Check | Verdict | Findings |
|---|---|---|---|
| C1-C3 | Coverage | [OK/warn] | [total %, files flagged] |
| P1-P3 | Pyramid | [OK/warn] | [layer breakdown] |
| T1 | .only committed | [OK/warn] | [N matches] |
| T2 | Skipped tests | [OK/warn] | [N matches, % of suite] |
| T3 | .todo placeholders | [OK/warn] | [N] |
| T4 | Empty test bodies | [OK/warn] | [N] |
| T5 | Tests without assertions | [OK/warn] | [N probable] |
| T6 | Hardcoded sleeps | [OK/warn] | [N] |
| T7 | Debug output | [OK/warn] | [N] |
| T8 | Multi-file .only | [OK/warn] | [N files] |

### Prioritized findings
For each finding with severity Medium or above:
[SEVERITY] [ID] [check] - [file:line] - [excerpt] - [impact] - [fix] - [effort: S=<1h / M=half day / L=day+]

### Quick wins
[Findings that meet all three: (a) Medium or High, (b) effort S, (c) single-file fix]
Format: "TEST-[n]: [one-line description]"
If no quick wins: state explicitly.

---

## Backlog writing rules

Present all findings with severity Medium or above as a numbered decision list, sorted Critical -> High -> Medium:

```
Found N findings at Medium or above. Which to add to backlog?

[1] [CRITICAL] TEST-? - file:line - one-line description
[2] [HIGH]     TEST-? - file:line - one-line description
[3] [MEDIUM]   TEST-? - file:line - one-line description
...

Reply with numbers to include (e.g. "1 2 4"), "all", or "none".
```

**Wait for explicit user response before writing anything.**

Then persist ONLY the approved entries via the backlog write-once protocol (`.claude/rules/backlog-protocol.md`) — in an active block append them to the session scratch; standalone, write them directly to `docs/refactoring-backlog.md`. Use the same entry format either way:
- Assign ID: `TEST-[n]` (next available after existing TEST entries)
- Add row to priority index
- Add full detail section with: issue, evidence (file:line + excerpt), fix suggestion, effort, risk

---

## Severity guide

- **Critical**: `.only` committed in any file (T1); multi-file `.only` breaking CI (T8); coverage at 0% on a file changed in the current block (C)
- **High**: Overall line coverage < 50% (C); empty test bodies (T4); tests without assertions (T5); skipped tests > 10% of suite (T2); no unit tests exist (P, unit-absent)
- **Medium**: Line coverage 50-80% (C); inverted pyramid, E2E > 30% (P); middle-heavy pyramid, integration > 50% (P); narrow pyramid, only one layer (P); hardcoded sleeps in tests (T6); skipped tests ≤ 10% of suite (T2)
- **Low**: `.todo` placeholders (T3); debug output left in tests (T7)
