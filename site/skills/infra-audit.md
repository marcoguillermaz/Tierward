# /infra-audit

> Infrastructure and CI/CD security audit - GitHub Actions workflows (pwn-request, secret logging, missing pinning, permissions overreach), Dockerfile (latest tag, USER root, ADD on URL), Kubernetes manifests (runAsNonRoot, privileged containers, hostNetwork), Terraform (IAM wildcards, state in git, module pinning), GitLab CI equivalent checks. Stack-agnostic.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Sonnet | `[target:layer:&lt;gha|docker|k8s|terraform|gitlab&gt;|target:file:&lt;glob&gt;|mode:all]` |

---

## Dove e quando

Run before merging infrastructure changes to GitHub Actions workflows, Dockerfiles, Kubernetes manifests, or Terraform modules. Stack-agnostic, it covers patterns that application-layer security reviews miss, such as overprivileged IAM roles and unpinned action versions.

## Output atteso

A severity-tagged report grouped by infrastructure layer with specific file paths and line numbers. A typical finding: a GitHub Actions workflow using `actions/checkout@v3` without a pinned SHA, flagged as a supply-chain risk with the recommended pinned reference shown.
