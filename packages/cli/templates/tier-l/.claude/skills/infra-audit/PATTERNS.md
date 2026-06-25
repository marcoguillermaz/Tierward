# Infra Audit - Patterns

Reference file for `/infra-audit`. Grep/regex patterns per check, organized by layer. The executing agent reads this at Step 2 and selects the sections matching layers detected in Step 1.

---

## Layer A - GitHub Actions patterns

File scope: `.github/workflows/*.{yml,yaml}`.

### GHA-1 Pwn-request pattern

Search for workflows with `pull_request_target:` trigger that also checkout the PR head:

```yaml
on:
  pull_request_target:     # flag
jobs:
  <any>:
    steps:
      - uses: actions/checkout@<any>
        with:
          ref: ${{ github.event.pull_request.head.sha }}   # or ref: ${{ github.head_ref }}
```

Regex chain:
- `grep -l "pull_request_target" .github/workflows/*.{yml,yaml}` → candidate files
- In each candidate: presence of `github\.event\.pull_request\.head\.sha` OR `github\.head_ref` inside a `checkout` step

Severity: Critical.

### GHA-2 Secret logging

Pattern: `echo`, `printf`, `tee`, `cat` combined with a secret expansion.

- `echo\s+.*\$\{\{\s*secrets\.\w+\s*\}\}`
- `echo\s+\$\{\s*SECRET_\w+\s*\}`
- `echo\s+"[^"]*\$\{\{\s*secrets\.\w+\s*\}\}[^"]*"`
- Look also for assignments to env followed by echo: `FOO=${{ secrets.X }} ... echo $FOO`

Severity: Critical.

### GHA-3 Unpinned actions

Match: `uses:\s+[\w\-./]+@(v\d+|main|master|\w+)` where the part after `@` is NOT a 40-char SHA.

Pin check: `^[0-9a-f]{40}$` for the part after `@`. Anything else → unpinned.

Exception: first-party `actions/*` and `github/*` on semver tags are commonly considered acceptable by some orgs. Flag with severity High; add note `first-party - consider org policy`.

### GHA-4 Permissions overreach

Workflow file lacks a top-level `permissions:` block AND the workflow uses any of: `GITHUB_TOKEN` in write-mode contexts (push, pull-request comment, issue comment, release create).

Detection:
- Absence of `^permissions:` at top level of the workflow YAML
- Presence of: `actions/github-script`, `peter-evans/create-pull-request`, `actions/create-release`, `JasonEtco/create-an-issue`, any `softprops/action-gh-release`, OR raw `${{ secrets.GITHUB_TOKEN }}` in a `run:` step that calls `git push` / `gh pr create` / `gh release create`

Severity: High.

### GHA-5 Self-hosted runner on public PR

Match: `runs-on:\s+(self-hosted|\[[^\]]*self-hosted[^\]]*\])` in a workflow file where triggers include `pull_request:` (NOT `pull_request_target:` - GHA-1 covers that case).

Public-repo gate: skip check if `.github/FUNDING.yml` or similar public-repo markers aren't present and the repo appears private (no easy static detection - flag with note: "Verify repo visibility").

Severity: Critical if repo is public; High as default flag.

### GHA-6 Untrusted input in run command

Expansion of user-controllable context directly into a `run:` step:

- `\$\{\{\s*github\.event\.pull_request\.title\s*\}\}`
- `\$\{\{\s*github\.event\.issue\.title\s*\}\}`
- `\$\{\{\s*github\.event\.issue\.body\s*\}\}`
- `\$\{\{\s*github\.event\.comment\.body\s*\}\}`
- `\$\{\{\s*github\.head_ref\s*\}\}` (inside `run:`)

Safer pattern: `env: TITLE: ${{ github.event.pull_request.title }}` then `run: echo "$TITLE"` - quote the shell variable.

Severity: High.

### GHA-7 Workflow modification permission

Match: `permissions:\s+write-all` OR a `permissions:` block with `actions:\s+write` or `contents:\s+write` that is not strictly necessary for the workflow's job output.

Severity: Medium (informational - cannot mechanically determine "necessity"; flag for human review).

---

## Layer B - Dockerfile patterns

File scope: `**/Dockerfile*` with content `^FROM `.

### D-1 Latest tag
- `^FROM\s+[\w/.-]+:latest\b` or `^FROM\s+[\w/.-]+\s*$` (no tag).
- Exception: multi-stage build intermediate stages tagged `AS <name>` without image tag are common and acceptable.

Severity: Medium.

### D-2 Root user
- No `^USER\b` directive in the file, OR last `^USER\s+(0|root)\b` in the file.
- Parse sequentially; the final `USER` directive wins.

Severity: High.

### D-3 ADD with URL
- `^ADD\s+https?://`

Severity: High.

### D-4 Unpinned base image
- `^FROM\s+[\w/.-]+:[\w.-]+$` (tag present, no `@sha256:`).

Severity: Medium.

### D-5 Secret in build arg / env
- `^ARG\s+(?i)(token|key|secret|password|pwd|credential|auth|apikey)\w*\b`
- `^ENV\s+(?i)(token|key|secret|password|pwd|credential|auth|apikey)\w*\s*[=]`

Severity: Critical.

### D-6 Apt without cleanup
- `^RUN\s+.*apt-get\s+install` AND same RUN does not include `rm\s+-rf\s+/var/lib/apt/lists`.

Severity: Low.

### D-7 Go single-stage build (Go-specific)

Applies when `go.mod` exists in the repo.

- `^FROM\s+golang:` in a Dockerfile that has only **one** `FROM` directive — no multi-stage build.
- Expected pattern: builder stage (`FROM golang:X.Y AS builder`) + minimal final stage (`FROM gcr.io/distroless/static` or `FROM scratch` or `FROM alpine`).
- Single-stage Go builds ship the full toolchain and source into the image.

Severity: Medium.

### D-8 Go final image not minimal (Go-specific)

Applies when a multi-stage Go build is detected (two or more `FROM` directives).

- Final `FROM` is NOT one of: `scratch`, `gcr.io/distroless/static`, `gcr.io/distroless/base`, `alpine`, `debian:slim`.
- Pattern: last `^FROM\s+(?!scratch|gcr\.io/distroless|alpine|.*slim)`.

Severity: Low.

---

## Layer C - Kubernetes patterns

File scope: `.{yml,yaml}` files whose top-level document contains `apiVersion:` + `kind:` where kind is a workload (`Deployment`, `StatefulSet`, `DaemonSet`, `Job`, `CronJob`, `Pod`, `ReplicaSet`).

### K-1 runAsNonRoot missing
Under `spec.template.spec.securityContext` (pod-level) or each `spec.template.spec.containers[].securityContext` (container-level): presence of `runAsNonRoot: true`. Missing → flag.

Severity: High.

### K-2 allowPrivilegeEscalation true
Under each container `securityContext`: `allowPrivilegeEscalation: true` or missing (defaults to true in many cases).

Severity: High.

### K-3 Privileged container
Under container `securityContext`: `privileged: true`.

Severity: Critical.

### K-4 Host namespace
Under pod spec: `hostNetwork: true`, `hostPID: true`, `hostIPC: true`.

Severity: Critical.

### K-5 Writable root filesystem
Under container `securityContext`: `readOnlyRootFilesystem: true`. Missing → flag.

Severity: Medium.

### K-6 Secret as env var
Under container `env`: `- name: ... valueFrom: secretKeyRef:`. The secret value becomes visible in process env.

Severity: Medium. Preferred alternative: `volumeMounts` from a Secret volume.

### K-7 ImagePullPolicy not Always for mutable tag
- Container `image: ...:latest` OR no tag, combined with `imagePullPolicy: IfNotPresent` or missing.

Severity: Low.

### K-8 Go workload missing health probes (Go-specific)

Applies when `go.mod` exists in the repo AND a Kubernetes workload manifest is found.

- `Deployment` or `StatefulSet` container with no `livenessProbe` or `readinessProbe` defined.
- Go HTTP servers should expose `/healthz` (liveness) and `/readyz` (readiness) endpoints; their absence makes restart policy and rolling update safety unreliable.

Severity: Low.

### K-9 Go operator without leader election (Go-specific)

Applies when `sigs.k8s.io/controller-runtime` appears in `go.mod`.

- Deployment with `replicas > 1` and no `leaderElection` flag in `args` (e.g. `--leader-elect=true`) or no `LeaderElection: true` in the controller manager config.
- Running multiple controller replicas without leader election causes duplicate reconciliation loops.

Severity: Medium.

---

## Layer D - Terraform patterns

File scope: `**/*.tf`.

### T-1 IAM wildcard action
- In `resource "aws_iam_policy" ...` or `resource "aws_iam_role_policy" ...` or `data "aws_iam_policy_document"`: JSON body with `"Action": "*"` or `"Action": "<service>:*"` pattern.
- HCL equivalent: `actions = ["*"]` or `actions = ["service:*"]`.

Severity: Critical.

### T-2 IAM wildcard resource
Same policy blocks: `"Resource": "*"` or `resources = ["*"]`.

Severity: High.

### T-3 Public S3 bucket
- `resource "aws_s3_bucket_public_access_block"` with `block_public_acls = false` or `restrict_public_buckets = false` or `ignore_public_acls = false`.
- `resource "aws_s3_bucket_acl"` with `acl = "public-read"` or `"public-read-write"`.

Severity: High.

### T-4 State file in git
- `git ls-files` includes `terraform.tfstate` OR any `*.tfstate*` OR `.terraform/` directory contents.

Severity: High. (The local check uses `git ls-files | grep -E "\.tfstate(\.backup)?$"`.)

### T-5 Module without version pin
- `source = "<url>"` where `<url>` is a git URL (`git::https://...`, `github.com/...`) without `?ref=<tag|sha>`.
- `source = "<namespace>/<module>/<provider>"` (registry source) without a sibling `version = "..."` line in the same module block.

Severity: Medium.

### T-6 Hardcoded secret
Regex: `(?i)(password|secret|key|token|api[_-]?key|access[_-]?key|credentials?)\s*=\s*"[^"]{8,}"`.

Exclusions:
- Lines inside `data "aws_secretsmanager_secret_version" ...` blocks (legitimate fetch).
- Lines inside `variable "..." { ... }` blocks where the value is a default empty string or null.
- `.tfvars` files (separate convention; may or may not be committed).

Severity: Critical.

---

## Layer E - GitLab CI patterns

File scope: `.gitlab-ci.yml` at repo root.

### GL-1 Secret logging
Same principle as GHA-2: `echo`, `printf`, `tee` combined with a GitLab variable expansion that starts with `$CI_*_TOKEN`, `$SECRET_*`, `$CI_JOB_TOKEN`, `$DEPLOY_*_TOKEN`, or any variable declared as `masked: true` in the project's UI settings (not detectable from file alone - flag any expansion matching known secret-variable patterns).

Severity: Critical.

### GL-2 Unpinned image
- Top-level or job-level `image:\s+[\w/.-]+:latest` or `image:\s+[\w/.-]+\s*$` (no tag).

Severity: Medium.

### GL-3 Unprotected runner
- Job consumes a protected variable (`$CI_REGISTRY_PASSWORD`, `$CI_DEPLOY_TOKEN`, any `*_TOKEN`) in a `script:` step AND the job has no `rules:` entry gating on `$CI_COMMIT_REF_PROTECTED == "true"` or `$CI_COMMIT_BRANCH == "main"` / `"master"` / `"production"`.

Severity: High.

### GL-4 Script injection via CI variable
Expansion into `script:` steps:
- `$CI_COMMIT_MESSAGE`
- `$CI_COMMIT_TITLE`
- `$CI_MERGE_REQUEST_TITLE`
- `$CI_MERGE_REQUEST_DESCRIPTION`

Flag when expanded without single-quote wrapping or `printf '%s'` safe quoting.

Severity: High.

---

## Notes

- All layer patterns are best-effort grep-style; complex YAML structures (anchors, merge keys, multiline strings) may evade simple patterns. Findings are `probable` when the match is ambiguous (e.g. `allowPrivilegeEscalation: false` set at pod level but overridden per container).
- Patterns are stack-agnostic: a FastAPI project and a Rails project with identical `.github/workflows/ci.yml` produce identical GHA findings.
- When a layer has markers but the applicable subset of checks is empty (e.g. Dockerfile without `RUN apt-get`), skip the inapplicable checks silently - do not report `N/A` per check.
