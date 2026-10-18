# Questions / follow-ups for #185 (refresh token removed from the client-visible session)

1. Spec AC3 says "grep for 'refreshToken' in apps/web/lib/auth.ts returns zero matches". That cannot hold
   without breaking token refresh: the encrypted, server-side NextAuth JWT must keep the refresh token
   (`jwt` callback, `refreshAccessToken`, `signOut` revocation, `authorize` mapping, and the `User` / `JWT`
   module augmentations). Moving that code out of `auth.ts` would refactor the refresh flow, which the
   spec puts out of scope. What I did instead: the only client-visible path is gone. `session.refreshToken`
   has zero matches, the `Session` type has no `refreshToken` member (a probe `s.refreshToken` fails with
   TS2339), and unit tests plus the e2e-army test check the session JSON. If the literal zero-grep is still
   wanted, that is a follow-up: move `requestTokenRefresh`/`refreshAccessToken` into `auth-refresh.ts`.
