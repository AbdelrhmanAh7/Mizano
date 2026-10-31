/**
 * Redirect addresses an AI app may register: HTTPS anywhere, or HTTP on this machine's loopback
 * (desktop and command-line apps such as Claude Code, Codex and Gemini CLI listen on a local
 * port). No fragments, no credentials.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isRegistrableRedirectUri(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.hash || raw.includes('#') || url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
}

/**
 * Exact string match against the registered addresses. The one exception is the port of a
 * loopback address, which a native app picks at run time (RFC 8252 §7.3, OAuth 2.1 §8.4.2):
 * scheme, host, path and query must still match exactly.
 */
export function redirectUriAllowed(requested: string, registered: readonly string[]): boolean {
  if (registered.includes(requested)) return true;
  const req = parse(requested);
  if (!req || req.protocol !== 'http:' || !LOOPBACK_HOSTS.has(req.hostname)) return false;
  return registered.some((r) => {
    const reg = parse(r);
    return (
      !!reg &&
      reg.protocol === req.protocol &&
      reg.hostname === req.hostname &&
      reg.pathname === req.pathname &&
      reg.search === req.search
    );
  });
}

function parse(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** Builds the redirect back to the app (RFC 6749 §4.1.2) with `iss` (RFC 9207). */
export function buildRedirect(
  redirectUri: string,
  params: Record<string, string | null | undefined>,
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}
