---
name: infra-audit
description: Infrastructure and CI/CD security audit - GitHub Actions workflows (pwn-request, secret logging, missing pinning, permissions overreach), Dockerfile (latest tag, USER root, ADD on URL), Kubernetes manifests (runAsNonRoot, privileged containers, hostNetwork), Terraform (IAM wildcards, state in git, module pinning), GitLab CI equivalent checks. Stack-agnostic.
user-invocable: true
model: sonnet
context: fork
argument-hint: [target:layer:<gha|docker|k8s|terraform|gitlab>|target:file:<glob>|mode:all]
allowed-tools: Read Glob Grep Bash(git ls-files:*) Bash(grep:*)
---

## Scope for v1

- **Static analysis only.** Parses workflow files, Dockerfiles, K8s manifests, Terraform files, and GitLab CI configs on disk. Does not execute workflows, does not connect to cloud providers, does not validate runtime state.
- **Five layers**: GitHub Actions, Dockerfile, Kubernetes manifest, Terraform, GitLab CI. Each layer runs only if its markers are detected (see Step 1) - no noisy N/A sections for layers that don't apply.
- **Stack-agnostic**: the detected backend language / framework does NOT affect which checks run. Infrastructure is orthogonal to application stack.

---

## Configuration (adapt before first run)

> Replace these placeholders:
> - `[WORKFLOWS_PATH]` - GitHub Actions workflows (default: `.github/workflows/`)
> - `[DOCKERFILE_PATH]` - Dockerfile location if non-standard (default: `Dockerfile` at repo root)
> - `[K8S_PATH]` - Kubernetes manifest directory (default: `k8s/`, `deploy/`, `manifests/` - auto-detect)
> - `[TERRAFORM_PATH]` - Terraform directory (default: `terraform/`, `infra/`, `iac/` - auto-detect)
> - `[GITLAB_CI_PATH]` - GitLab CI config (default: `.gitlab-ci.yml` at repo root)

---

## Step 0 - Target and mode resolution

Parse `$ARGUMENTS` for `target:` or `mode:` tokens.

| Pattern | Meaning |
|---|---|
| `target:layer:<gha\|docker\|k8s\|terraform\|gitlab>` | Audit only one layer |
| `target:file:<glob>` | Audit a specific file or glob |
| `mode:all` / no argument | **Full audit - every layer whose markers are detected in Step 1.** |

Announce: `Running infra-audit - scope: [FULL | target: <resolved>]`

---

## Step 1 - Layer detection

Detect which layers apply. Each has a marker - absence means the layer is skipped entirely with no findings (not "N/A flagged").

| Layer | Marker |
|---|---|
| **GHA** (GitHub Actions) | `.github/workflows/*.{yml,yaml}` exists |
| **Docker** | `Dockerfile` at repo root OR any `**/Dockerfile*` with content matching `^FROM ` |
| **K8s** | `.{yml,yaml}` files matching `apiVersion:` + `kind:` + common K8s kinds (`Deployment`, `Service`, `Pod`, `StatefulSet`, `DaemonSet`, `Job`, `CronJob`, `Ingress`, `ConfigMap`, `Secret`) |
| **Terraform** | `*.tf` files exist |
| **GitLab CI** | `.gitlab-ci.yml` at repo root |

Announce each detected layer: `Layers detected: [GHA × 4 workflows, Docker × 1, Terraform × 7 files]`.

If **no layers detected**: `No infrastructure files found. Expected: .github/workflows/, Dockerfile, k8s manifests, Terraform, or .gitlab-ci.yml.` Exit 0.

Stack-specific patterns for each layer live in `${CLAUDE_SKILL_DIR}/PATTERNS.md`.

---

## Step 2 - Per-layer static checks

Run the checks for each detected layer. Skip layers without markers. Record findings as SEVERITY / CHECK / FILE:LINE / EVIDENCE / IMPACT / FIX.

### Layer A - GitHub Actions (GHA-1 to GHA-7)

- **GHA-1 Pwn-request pattern** (**Critical**): `pull_request_target` trigger + `actions/checkout` with a ref from `${{ github.event.pull_request.head.sha }}` or no explicit ref. Runs untrusted PR code with write access to repository secrets. Patterns in PATTERNS.md → "GHA-1".
- **GHA-2 Secret logging** (**Critical**): `echo` / `printf` / `Write-Host` with a secret expansion: `${{ secrets.X }}` in an `echo` statement, or secret piped to `tee` / `cat`. Secret leaks into run logs indexable by anyone with repo read access.
- **GHA-3 Unpinned actions** (**High**): `uses: <action>@main` / `@master` / `@v<major>` without SHA pin. Supply-chain vulnerability - action author can push malicious commits to the tag and every workflow pulls it on next run.
- **GHA-4 Permissions overreach** (**High**): workflow without explicit top-level `permissions:` block AND `GITHUB_TOKEN` writes to the repo (push, PR comment, issue write, release). Default token has write-all; explicit `permissions:` should restrict.
- **GHA-5 Self-hosted runner on public PR** (**Critical**): `runs-on: self-hosted` (or group label) in a workflow triggered by `pull_request` on a public repo. Public contributors can execute code on your self-hosted runner.
- **GHA-6 Untrusted input in run command** (**High**): direct expansion of `${{ github.event.pull_request.title }}`, `${{ github.event.issue.body }}`, `${{ github.head_ref }}`, `${{ github.event.comment.body }}` into a `run:` step without `env:` quoting. Script injection.
- **GHA-7 Workflow modification permission** (**Medium**): `permissions: write-all` or `permissions.actions: write` without necessity - allows a compromised run to modify workflow files.

### Layer B - Dockerfile (D-1 to D-6)

- **D-1 Latest tag** (**Medium**): `FROM <image>:latest` or `FROM <image>` without tag. Build not reproducible; next rebuild may pull a different image.
- **D-2 Root user** (**High**): no `USER` directive, or `USER root` / `USER 0` in final image. Container process runs as root unnecessarily.
- **D-3 ADD with URL** (**High**): `ADD http(s)://...` statement. Prefer `RUN curl ... && ...` with explicit verification (checksum or signature).
- **D-4 Unpinned base image** (**Medium**): `FROM <image>:<tag>` without digest (`@sha256:...`). Tag-based pulls can be silently repointed by the registry.
- **D-5 Secret in build arg or env** (**Critical**): `ARG <name>` + `ENV <name>=$<name>` where `<name>` matches `(?i)(token|key|secret|password|pwd|credential)`. Secret baked into image layers.
- **D-6 Apt without cleanup** (**Low**): `apt-get install` without `rm -rf /var/lib/apt/lists/*` in the same RUN layer. Image bloat; not a security issue but noise.

### Layer C - Kubernetes (K-1 to K-7)

- **K-1 runAsNonRoot missing** (**High**): container / pod `securityContext` missing `runAsNonRoot: true`. If base image runs as root, container runs as root.
- **K-2 allowPrivilegeEscalation true** (**High**): `securityContext.allowPrivilegeEscalation: true`. Permits setuid escalation - rarely needed.
- **K-3 Privileged container** (**Critical**): `securityContext.privileged: true`. Full host access - near-equivalent to root on the node.
- **K-4 hostNetwork / hostPID / hostIPC** (**Critical**): pod specs with `hostNetwork: true`, `hostPID: true`, `hostIPC: true`. Namespace breakout risk.
- **K-5 Writable root filesystem** (**Medium**): `securityContext.readOnlyRootFilesystem` missing or `false`. Container can write anywhere; makes malware persistence easier.
- **K-6 Secret as env var** (**Medium**): `env` block with `valueFrom.secretKeyRef` → the secret appears as an environment variable. `volumeMounts` from a Secret volume is preferred (does not appear in process env).
- **K-7 ImagePullPolicy not Always for mutable tag** (**Low**): `image: ...:latest` with `imagePullPolicy: IfNotPresent` or missing. Tag updates won't propagate to running nodes.

### Layer D - Terraform (T-1 to T-6)

- **T-1 IAM wildcard action** (**Critical**): policy resource (`aws_iam_policy`, `aws_iam_role_policy`) with `Action: "*"` or `Action: "<service>:*"` granting full service access.
- **T-2 IAM wildcard resource** (**High**): same policies with `Resource: "*"`. Scope should be restricted to specific ARNs.
- **T-3 Public S3 bucket** (**High**): `aws_s3_bucket_public_access_block` with `block_public_acls = false` / `restrict_public_buckets = false`, OR `aws_s3_bucket_acl` with `acl = "public-read"` / `"public-read-write"`.
- **T-4 State file in git** (**High**): `terraform.tfstate` or `*.tfstate*` tracked in git (check `git ls-files`). State contains secrets in plain text.
- **T-5 Module without version pin** (**Medium**): `source = "..."` pointing to a git URL without `?ref=<tag|sha>`, or `source = "hashicorp/..."` without `version = "~> X.Y"`. Drift risk.
- **T-6 Hardcoded secret** (**Critical**): string literal matching `(?i)(password|secret|key|token)\s*=\s*"[^"]+"` in `.tf` files (exclude `data` blocks fetching from a secret manager).

### Layer E - GitLab CI (GL-1 to GL-4)

- **GL-1 Secret logging** (**Critical**): `echo $CI_*_TOKEN`, `echo $SECRET_*`, or explicit secret variable name expanded into `echo` / `tee` / stdout. Same principle as GHA-2.
- **GL-2 Unpinned image** (**Medium**): `image: <name>:latest` or `image: <name>` without tag in `.gitlab-ci.yml`.
- **GL-3 Unprotected runner tags** (**High**): job running on a shared runner with access to protected variables (`rules: - if: $CI_COMMIT_REF_PROTECTED == "true"` missing for jobs that consume `$CI_*_TOKEN`).
- **GL-4 Script injection via CI variable** (**High**): `script:` step containing direct expansion of user-controllable vars (`$CI_COMMIT_MESSAGE`, `$CI_MERGE_REQUEST_TITLE`) without quoting.

---

## Step 3 - Report

```
## Infrastructure Audit - [DATE] - [SCOPE] - layers: [LAYERS_DETECTED]

### Executive summary
[2-5 bullets. Critical + High findings only. Concrete facts: file:line, layer, impact. If nothing Critical/High: state "No critical or high findings across N layers."]

### Infrastructure maturity assessment
| Dimension | Rating | Notes |
|---|---|---|
| GHA security | strong / adequate / weak / N/A | [count of GHA-1..7 findings; N/A if GHA not detected] |
| Container hygiene | strong / adequate / weak / N/A | [D-1..6 findings; N/A if Docker not detected] |
| K8s posture | strong / adequate / weak / N/A | [K-1..7 findings; N/A if K8s not detected] |
| Terraform discipline | strong / adequate / weak / N/A | [T-1..6 findings; N/A if Terraform not detected] |
| GitLab CI hygiene | strong / adequate / weak / N/A | [GL-1..4 findings; N/A if GitLab CI not detected] |
| Release readiness | ready / conditional / blocked | [blocked = any Critical] |

### Check verdicts
[One row per layer detected, listing each check ID + verdict + finding count. Skip entire rows for layers not detected in Step 1.]

### Prioritized findings
For each finding with severity Medium or above:
[SEVERITY] [ID] [check] - [file:line] - [evidence excerpt] - [impact] - [fix] - [effort: S / M / L]

### Quick wins
[Findings meeting: (a) Medium or High, (b) effort S, (c) single-file fix]
Format: "INFRA-[n]: [one-line description]"
If none: state explicitly.
```

---

## Step 4 - Backlog decision gate

Present Medium-or-above findings as numbered decision list (Critical → High → Medium):

```
Found N findings at Medium or above. Which to add to backlog?

[1] [CRITICAL] INFRA-? - .github/workflows/ci.yml:42 - pwn-request pattern
[2] [HIGH]     INFRA-? - Dockerfile:8 - running as root
[3] [MEDIUM]   INFRA-? - k8s/deploy.yaml:24 - writable root filesystem
...

Reply with numbers to include (e.g. "1 2 4"), "all", or "none".
```

**Wait for explicit user response before writing anything.**

Persist approved entries via the backlog write-once protocol (`.claude/rules/backlog-protocol.md`) — session scratch in an active block, direct to `docs/refactoring-backlog.md` standalone:
- Assign ID: `INFRA-[n]` (next available)
- Add row to priority index
- Add full detail: issue, evidence, fix, effort, risk

### Severity guide

- **Critical**: pwn-request (GHA-1); secret logging in CI (GHA-2, GL-1); self-hosted runner on public PR (GHA-5); privileged container (K-3); hostNetwork/hostPID/hostIPC (K-4); IAM wildcard action (T-1); state file in git (skip if not the issue - see T-4 for exact scoping); hardcoded secret in Terraform (T-6); secret baked into Docker image (D-5)
- **High**: unpinned action (GHA-3); permissions overreach (GHA-4); untrusted input in run (GHA-6); Docker root user (D-2); ADD with URL (D-3); K8s runAsNonRoot missing (K-1); allowPrivilegeEscalation (K-2); IAM wildcard resource (T-2); public S3 bucket (T-3); GitLab unprotected runner (GL-3); GitLab script injection (GL-4)
- **Medium**: workflow modification permission (GHA-7); Docker latest tag (D-1); unpinned base image (D-4); K8s writable rootfs (K-5); K8s secret as env var (K-6); Terraform module without version pin (T-5); GitLab unpinned image (GL-2)
- **Low**: apt without cleanup (D-6); imagePullPolicy not Always (K-7)

---

## Execution notes

- Do NOT modify infrastructure files. Audit only.
- Do NOT connect to cloud providers or clusters. Static file analysis only.
- If a layer has markers but the check subset is not exhaustively applicable (e.g. a Dockerfile without `RUN apt-get`), skip the inapplicable checks silently - do not flag "N/A".
- This skill complements `/security-audit` (application-layer auth/validation) and `/migration-audit` (DB schema safety). Run in Phase 5d Track C on every block, especially blocks that modify workflow files, Dockerfiles, K8s manifests, or Terraform.
- After the report, ask: "Do you want me to prepare the corrections for the identified findings?" Reply with `yes` only after user sign-off.
