// Codespaces only: API_PROXY_TARGET is unset everywhere else, so there is no rewrite.
// The browser calls the API through the web address because the private forwarded API port
// rejects cross-origin preflights. /api/backend/* avoids NextAuth's /api/auth and the locale
// middleware, which skips /api/.
function apiProxyRewrites(target = process.env.API_PROXY_TARGET) {
  return target ? [{ source: '/api/backend/:path*', destination: `${target}/api/:path*` }] : [];
}

module.exports = { apiProxyRewrites };
