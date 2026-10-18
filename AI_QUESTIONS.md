# Questions for the owner (#183)

1. Please label #183 `ci-change` (or wire it by hand) so the two pending workflow edits in
   `docs/ops/pending-workflow-changes.md` can land: the `ci.yml` step `bash scripts/check-compose-security.sh`
   (needs Docker Compose v2 + jq, both on GitHub-hosted runners) and the `deploy.yml` hex `REDIS_PASSWORD`.
   Until then no real `docker compose config` output exists for this PR; the CI run of the script would be it.
