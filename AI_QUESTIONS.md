# AI_QUESTIONS.md — issue #110 (readiness endpoint)

Notes for the owner. None of these block the endpoint; they are follow-ups outside the scope of #110.

1. **`DATA_DIR` is not passed through compose.** The disk probe reads `process.env.DATA_DIR` and falls back to the API working directory, which on the Pi sits on the same root disk as the Docker volumes. When the data volume moves to a separate disk, add `DATA_DIR=/path/on/that/volume` to the `api` service in `docker-compose.production.yml` (compose edits are out of scope for #110).
2. **`READY_MIN_FREE_PCT` and `READY_DB_TIMEOUT_MS` are optional.** Defaults are 10 % and 2000 ms. Pass them through compose only if the Pi needs other values.
3. **nginx routing.** `nginx/nginx.conf` proxies `location /api/`, so `/api/health/ready` is reachable through nginx without changes. The Pi monitor (#43) can also hit the API port directly.
