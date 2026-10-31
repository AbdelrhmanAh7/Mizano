# AI apps connect to Mizano over MCP

Owner request, 31 Oct 2026: the owner's own AI app (Claude, ChatGPT, Codex or Gemini, on their own subscription) connects to Mizano and works through Mizano's tools, with no API key. In-app AI with an organization's own key ([ai-own-accounts.md](ai-own-accounts.md)) stays as it is. Nothing is posted, sent, paid or deleted without a person in Mizano.

## Protocol

- MCP specification **2026-07-28**, official TypeScript SDK v2 (`@modelcontextprotocol/server` 2.4, `@modelcontextprotocol/node` 2.1). `createMcpHandler` builds one stateless `McpServer` per request and also serves 2025-era clients (stateless fallback), so Claude, ChatGPT, Codex and Gemini CLI connect today.
- Endpoint: `POST /mcp` at the API origin root (`MCP_PUBLIC_URL`, excluded from the `/api` prefix). The Origin header is checked (DNS rebinding); server-side AI apps send none.

## Authorization (OAuth 2.1 inside Mizano)

The SDK v2 ships no authorization server, so Mizano implements one in `modules/mcp/oauth/`:

| Piece                         | Where                                                         | Rule                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Protected resource metadata   | `/.well-known/oauth-protected-resource/mcp` (RFC 9728)        | `resource = <MCP_PUBLIC_URL>/mcp`, scopes `mizano:read`, `mizano:drafts`                                                          |
| Authorization server metadata | `/.well-known/oauth-authorization-server` (RFC 8414)          | S256 only, `iss` in responses (RFC 9207), no client ID metadata documents yet                                                     |
| Client registration           | `POST /oauth/register` (RFC 7591)                             | https, or http on loopback; no fragments; at most 10; throttled per IP; unused registrations purged after 30 days                 |
| Authorization                 | `GET /oauth/authorize` → web `/<locale>/connect-ai/<request>` | unknown client or unregistered redirect → error page, never a redirect; exact match (loopback may change only the port, RFC 8252) |
| Consent                       | web, signed in                                                | the person picks _read only_ or _read and prepare drafts_; the grant is bound to the organization they are signed into            |
| Token                         | `POST /oauth/token`                                           | code: single use (60 s), PKCE S256, same redirect URI, audience check; a second use revokes the grant                             |
| Refresh                       | `POST /oauth/token`                                           | rotates on every use; a used refresh token coming back revokes the whole grant (reuse detection)                                  |
| Revocation                    | `POST /oauth/revoke` (RFC 7009), Settings → AI                | ends the grant and deletes its tokens                                                                                             |

Tokens are opaque (`mzm_at_…`, `mzm_rt_…`, 256 random bits), stored as sha256 only. Access tokens live 30 minutes, refresh tokens 30 days. Each token row carries its audience (`resource`); `/mcp` accepts only tokens for itself, and only while the grant is live and its user is still active in the grant's organization.

Why the organization is not chosen freely: a user row is per organization, and a row with the same email in another organization is not proof of identity there. To connect another organization, sign into it.

## Tools

Every call checks the token scope (`mizano:drafts` implies `mizano:read`) and then the same role rule as the web route (`PermissionsGuard.roleHolds`); tools the connection or the role cannot use are not even listed. Every query carries the grant's `organizationId`. Answers are short, in the request language (`Accept-Language`, else the consent-screen language, else Arabic), with amounts as decimal strings.

- Read (`readOnlyHint`): `find_customers`, `find_vendors`, `find_items` (Arabic-normalised: tashkeel/tatweel stripped, أ/إ/آ→ا, ى→ي, ة→ه, Arabic-Indic digits, plus `pg_trgm` similarity), `list_invoices` / `list_bills` (unpaid, overdue, draft, paid, all), `get_invoice`, `get_bill`, `receivables_aging`, `payables_aging`, `profit_and_loss`, `balance_sheet`, `cash_summary`, `vat_summary`, `recent_payments`, `expense_account_options`. Reports come from the report services, so they reconcile with the report pages.
- Drafts (`destructiveHint: false`): `draft_quote`, `draft_invoice`, `draft_bill`, `draft_expense` (PENDING, no journal). They reuse the create commands and DTO rules of the web forms, write an audit row with `source: mcp`, clear the list caches and return the link where a person reviews and posts.

## Limits and logs

- 90 requests per minute per connection (grant), so refreshing tokens cannot reset it; the IP throttler is skipped on `/mcp`.
- `mcp_tool_calls`: tool, organization, user, grant, success, error code, duration. Never arguments, amounts or results; logs carry the same metadata only.

## Not in this change

- Client ID Metadata Documents (a SHOULD in the 2026-07-28 spec; dynamic registration is kept for current clients). Fetching a client-chosen URL needs the SSRF rules of review lesson 10.
- Streaming answers and resources/prompts: tools only.
