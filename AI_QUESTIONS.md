# AI_QUESTIONS.md — CI Red Diagnosis & Proposed Fix for Issue #102

## Issue #102 Diagnosis: Failing "Deploy to GCP" Job

### Diagnosis

Default branch CI at commit `615060e` is red due to the workflow `Deploy to Production` (Run ID: `37540990404`, Job: `Deploy to GCP`).
The failure occurs at the step `Clean up server disk and prepare directory` with error:

```text
dial tcp ***:22: i/o timeout
```

This is **Root Cause (B) & (C)**:

1. **(B) Infrastructure unreachable**: The GCP VM host defined in `DEPLOY_HOST` is unreachable via SSH on port 22 (connection times out after 30s). This failure has occurred on every master commit since at least 2026-10-02 (`37063704966`).
2. **(C) Workflow trigger definition**: `.github/workflows/deploy.yml` triggers automatically on `workflow_run` whenever `CI` completes on `master`. Furthermore, the project constitution (`AGENTS.md`) establishes that the active deployment target is **Raspberry Pi 5 (8GB, arm64)**, rendering the GCP auto-deploy workflow legacy and blocking default branch status.

In accordance with repo owner instructions ("Never modify .github/workflows, CI config or anything under secrets unless the issue is explicitly about CI — write CI suggestions in AI_QUESTIONS.md instead; CI changes always stop at the owner"), no workflow files or secrets were modified in this PR.

---

## Proposed Options

### Option 1 (Recommended): Gate GCP Deployment to Manual Trigger (`workflow_dispatch`)

Remove automatic execution on `master` pushes (`workflow_run`) from `.github/workflows/deploy.yml`:

```diff
--- a/.github/workflows/deploy.yml
+++ b/.github/workflows/deploy.yml
@@ -14,10 +14,6 @@ name: Deploy to Production

 on:
-  workflow_run:
-    workflows: ["CI"]
-    types: [completed]
-    branches: [master]
   release:
     types: [published]
   workflow_dispatch:
```

**Rationale**: Keeps default branch CI green and decoupled from the offline GCP VM, while preserving the ability to manually deploy via `workflow_dispatch` when the VM is available.

### Option 2: Retire GCP Workflow in Favor of Pi Deployment

Disable or remove `.github/workflows/deploy.yml` entirely, transitioning deployment to the Raspberry Pi workflow (`deploy/pi`, Epic #45).

### Option 3: Restore GCP VM Infrastructure

If the GCP VM is still intended for production/staging, the owner must update GCP firewall rules or restart the VM at `DEPLOY_HOST` to allow inbound SSH on port 22 from GitHub Actions IP ranges.

---

## Default Decision

**Option 1**: Owner modifies `.github/workflows/deploy.yml` to remove the automatic `workflow_run` trigger on `master`, gating GCP deployment to `workflow_dispatch` or `release`.
