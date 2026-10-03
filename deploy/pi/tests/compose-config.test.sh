#!/usr/bin/env bash
# No daemon or registry needed. All credentials and digests are test fixtures.
set -euo pipefail
pi_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
mkdir "$scratch/docker-config"
digest=$(printf '0%.0s' {1..64})
sed "s/OWNER/example/g; s/REPLACE_WITH_DIGEST/$digest/g; s/REPLACE_ME/test-only-secret/g" \
  "$pi_dir/.env.pi.example" >"$scratch/env"
docker --config "$scratch/docker-config" compose -f "$pi_dir/docker-compose.pi.yml" \
  --env-file "$scratch/env" config --format json >"$scratch/config.json"
node - "$scratch/config.json" <<'JS'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const services = config.services;
for (const service of Object.values(services)) {
  assert.equal((service.ports || []).length, 0);
  assert.equal(service.logging.options['max-size'], '10m');
  assert.equal(service.logging.options['max-file'], '3');
}
assert.equal(services.api.environment.NODE_ENV, 'production');
assert.equal(services.api.environment.APP_ENV, 'prod');
assert.equal(services.api.environment.CORS_ORIGIN, services.web.environment.NEXTAUTH_URL);
assert.equal(services.api.environment.OLLAMA_ENABLED, 'false');
assert.equal(services.web.environment.HOSTNAME, '0.0.0.0');
assert.equal(services.web.environment.API_INTERNAL_URL, 'http://api:6001/api');
assert.match(services.gateway.image, /@sha256:[a-f0-9]{64}$/);
assert.match(services.cloudflared.image, /@sha256:[a-f0-9]{64}$/);
assert.match(services.api.healthcheck.test.join(' '), /127\.0\.0\.1:6001\/api\/health/);
assert.match(services.web.healthcheck.test.join(' '), /127\.0\.0\.1:5001\/robots\.txt/);
assert.match(services.gateway.healthcheck.test.join(' '), /127\.0\.0\.1:8080\/robots\.txt/);
assert.match(services.postgres.healthcheck.test.join(' '), /-h 127\.0\.0\.1/);
process.stdout.write('PASS: parsed Compose ingress, production, health and retention contracts\n');
JS
