# Mizano screenshots

Captured 1 November 2026 from the web app at `master` 69081778, run locally (`next dev`, no server behind it and no account),
with Playwright driving Google Chrome: 390 px (phone, 2x) and 1440 px (desktop), Arabic and English. Every page was checked for
sideways scrolling (none) and for the right direction (Arabic right-to-left, English left-to-right). No account was created
anywhere.

| File | Page |
|---|---|
| `login.{ar,en}.{390,1440}.png` | Sign in (`/{ar,en}/login`). The 1440 px files show only the sign-in form (see below). |
| `register.{ar,en}.{390,1440}.png` | Create account (`/register`) |
| `forgot-password.{ar,en}.{390,1440}.png` | Forgot password (`/forgot-password`) |
| `reset-password.{ar,en}.{390,1440}.png` | New password (`/reset-password`) |

## Left out on purpose (owner decision needed)
- **The landing page `/onboarding`** and **the side panel of the 1440 px sign-in page** make claims the sales kit cannot back:
  "33 AI models", "32 AI Models", "100% local AI", "zero-touch accounting", "no accounting knowledge required" and
  "Trusted by businesses for intelligent financial automation" (`apps/web/messages/{en,ar}/onboarding.json`, `auth.json`).
  Fix that copy before these pages are shown to a client; then capture them again.
- **App screens** (dashboard, scan, bills, journals, reports, settings): no demo organization exists on any live server, and we
  never create accounts on live data. The list to capture is at the end of `demo-script.en.md`.
