// Node 20.12+ provides the same env-file parser used by Node itself.
const { existsSync } = require('node:fs');
const file =
  process.argv.slice(2).find((arg) => arg !== '--') || `.env.${process.env.APP_ENV || 'local'}`;
if (!existsSync(file)) {
  console.error(`Missing: ${file}`);
  process.exit(1);
}
try {
  process.loadEnvFile(file);
  const explicit = process.env.MCP_PUBLIC_URL?.trim();
  const fallback = process.env.PUBLIC_API_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim();
  const raw = explicit || fallback?.replace(/\/api\/?$/, '/');
  if (raw) {
    const url = new URL(raw);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.pathname !== '/' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error('Invalid public API origin');
    }
  }
  console.log(`Using: ${file}`);
  console.log(
    `MCP: ${
      explicit
        ? 'MCP_PUBLIC_URL'
        : fallback
          ? 'public API origin'
          : process.env.NODE_ENV === 'production'
            ? 'off (no public API address)'
            : 'localhost'
    }`,
  );
} catch {
  console.error(
    'Environment check failed: check the env file and public API origin (no credentials, query or path except /api).',
  );
  process.exitCode = 1;
}
