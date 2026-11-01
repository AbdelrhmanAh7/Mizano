# Jarda sales kit

Written 2026-11-01 and checked against the code at `master` 69081778. Three rules: never invent customers, numbers, prices
or legal facts; the price line is «مجاني خلال الفترة التجريبية» / "Free during the pilot"; Arabic and English say the same.

| File                                                 | What it is                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `one-pager.ar.md`, `one-pager.en.md`                 | Who it is for, the problem, the first week, sourced differences, honest limits, pilot terms, how to start |
| `demo-script.ar.md`, `demo-script.en.md`             | 3-minute live demo and 60-second video storyboard                                                         |
| `screenshots/`                                       | Real public-page screenshots at 390 and 1440 px, Arabic and English (see its README)                      |
| `visual-prompts.md`                                  | Prompts for Google Nano Banana (images) and Veo / Flow (video)                                            |
| `objections.md`                                      | The 10 questions an owner or accountant will ask, answered in Arabic and English                          |
| `handbook/handbook.ar.md`, `handbook/handbook.en.md` | User handbook: the idea, then every journey step by step                                                  |

## Open items for the owner before these go to a client

1. **Contact details.** No support email, WhatsApp number or legal entity exists in the repository, so every file points to
   the support contact named in the signed pilot agreement.
2. **Landing and sign-in copy.** `/onboarding` and the sign-in side panel claim "33 AI models", "100% local AI", "zero-touch
   accounting", "no accounting knowledge required" and "Trusted by businesses"; the kit cannot back these. The Scan Bill page
   also says "AI will extract the data" when it reads without AI. Fix the copy (`apps/web/messages/*/onboarding.json`,
   `auth.json`, `ai.json`) before showing these pages.
3. **Hosting, backup schedule and support** for the pilot are written as "agreed in writing before the pilot"; decide them.
4. **Connect your AI app** works only where the server has it switched on; check it on the pilot server before a demo.
5. **Demo organization and app screenshots.** None exists on a live server; prepare one on a non-production copy, then capture
   the screens listed at the end of `demo-script.en.md`.
6. **Default language.** The app opens in English (`apps/web/i18n/config.ts`); the kit says "Arabic and English" and shows the
   language button rather than claiming Arabic is the default.
