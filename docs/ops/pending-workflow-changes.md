# Pending workflow changes for #183

Owner rule: workflow/CI files are not edited by the implementer, so **no change
below is applied in this PR**. The CTO approved the CI change (comment on PR #203,
2026-10-18) and no secret is created or rotated. Apply it by hand.

## `.github/workflows/ci.yml` (lint job)

Add a step. The script sets its own dummy passwords and unsets `REDIS_PASSWORD`,
so the step needs no env. It needs Docker Compose v2 and `jq` (both on
GitHub-hosted runners):

```yaml
- name: Compose security check
  run: bash scripts/check-compose-security.sh
```
