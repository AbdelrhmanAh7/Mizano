# Mizano: visual prompts for Google Nano Banana (images) and Veo / Google Flow (video)

_1 November 2026 · Ready to paste. The orchestrator generates them in the browser after the real screens are final. Scene numbers match `demo-script.en.md` Part B._

## Brand facts to reuse (from `apps/web/app/globals.css` and the logo in `apps/web/public/`)
- Interface primary blue **hsl(221, 83%, 53%)** (about #2563EB) · background white · text near-black **hsl(222, 84%, 5%)** · success green **hsl(142, 72%, 29%)** · warning amber-brown **hsl(26, 91%, 37%)**.
- Logo: a deep green rounded tile with a white "M" and a small gold dot; the word "mizano". Never redraw the logo with a model: add the real file in editing.
- Fonts: the system Arabic font for right-to-left, a plain sans-serif for Latin.
- Tone: calm, professional, trustworthy; lots of white space; clear tables and numbers; blue for actions, green for the brand.

## Rules for every prompt
- Attach the real screenshot as the reference image when the prompt says **[attach]** (files in `docs/sales/screenshots/` once captured). Models must not invent app screens: any screen shown must come from a real screenshot, or stay abstract.
- **Negative list (paste after every image prompt):** no logos or brand marks of any real company, no real people's faces, no invented statistics or percentages, no fake customer names or testimonials, no currency prices or amounts, no tiny unreadable text, no phone mockups with fabricated app UI, no Latin letters inside Arabic words, no mirrored or broken Arabic letters, no ETA/ZATCA logos or tax authority marks.
- **Arabic text:** keep it to 2 to 5 words, large, right-to-left, exactly as quoted. If the model garbles the Arabic, generate the image **without text** and add the text in a design tool.
- Price line when text allows: «مجاني خلال الفترة التجريبية» / "Free during the pilot". No other price.

---

## A. Nano Banana: images

### A1. Hero image, 16:9 (website header, 2560×1440)
**Purpose:** background for a landing page or share card.
**Prompt:**
> Clean modern illustration for an accounting software hero banner, 16:9. A pale blue-to-white gradient background (#EFF6FF to #FFFFFF) with a lot of empty space on the right side for a headline. On the left, a calm arrangement of three elements stacked vertically: a simplified document page with faint line items, an arrow flowing down to a small ledger book icon, and from the ledger a thin blue (#2563EB) line connecting to a balanced scale. Flat vector style with subtle shadows, soft rounded shapes, minimal, professional, no people, no text, no logos. The feeling is "document becomes a balanced entry".

### A2. Social post, 1:1 (1080×1080): "From bill to books"
**Purpose:** introduce the concept.
**Prompt:**
> Square social post, soft blue-to-white gradient background. In the center, a simplified document icon (a white rounded rectangle with faint grey lines suggesting text) with a small camera icon overlaid (suggesting a photo scan). Below it, a thin green curved arrow flows down to a small open ledger icon with a green check mark. Clean, trustworthy, plenty of space, flat vector style.
**On-image text (exact, Arabic, right-to-left, large):** «من الفاتورة إلى الدفاتر» and small under it «ميزانو».

### A3. Social post, 1:1: "The accountant approves"
**Purpose:** the promise (batch approval, accountant controls).
**Prompt:**
> Square illustration. Center: a simplified spreadsheet-like grid with three rows, two rows have a small green check mark badge, one row has a small amber dot (flagged). Below the grid, a single large rounded green button shape. Minimal flat vector, pale background #FAFAFA, rounded shapes, no people, no logos. The feeling is "select, review, approve in one action".
**On-image text (exact):** «المحاسب يوافق».

### A4. Social post, 1:1: "Free during the pilot"
**Prompt:**
> Square announcement card, pale blue background (#EFF6FF), a single large white rounded card in the center with generous padding, a small blue sparkle icon above the text area. Clean, friendly, very simple, no people, no logos.
**On-image text (exact, two lines, right-to-left, large):** «مجاني» then «خلال الفترة التجريبية».

### A5. Story / Reel cover, 9:16 (1080×1920): "Source to ledger"
**Prompt:**
> Vertical 9:16 poster. Top third: empty space with a pale blue gradient (for a headline). Middle: a vertical flow made of three round white nodes stacked top to bottom, linked by one smooth green curve: a document page icon, a magnifying glass icon (review), a ledger book icon with a check mark. Bottom third: empty clean space for a call to action. Flat vector, soft shadows, minimal, safe margins of 10% on all sides.
**On-image text (exact, Arabic, large, centered):** top «من المستند إلى الدفتر»; bottom «مجاني خلال الفترة التجريبية».

### A6. Story, 9:16: "Arabic and English"
**Prompt (background only):**
> Vertical 9:16 soft gradient background from #FFFFFF at the top to #EFF6FF at the bottom, a few thin flowing blue curves in the corners, large empty center for a screenshot, no text, no devices, no people.
**On-image text (add in editing):** «عربي وإنجليزي».

### A7. English variants
Repeat A2, A3, A4 and A5 with the English text: "From bill to books" · "The accountant approves" · "Free during the pilot" · "Source to ledger". English is left-to-right and aligned left.

---

## B. Veo / Google Flow: video

General rules: **no spoken words, no text rendered by the model** (add titles, voice-over and the logo in editing); no real people's faces; no fake app UI: for screens, use the real recording from `demo-script.en.md` and let the model make only background, transitions or abstract connecting shots. Style: flat vector motion graphics, soft blue-to-white gradient, calm smooth easing. Audio: soft ambient only, or none.

### B1. 8-second hero clip, 16:9 (loop-friendly), no audio needed
> 8-second seamless looping motion graphic, 16:9. A pale blue-to-white gradient background. A simplified document page slides in from the left, a thin green scanning line moves across it top to bottom, then the document shrinks and flows along a curved green line into a small ledger book icon on the right that briefly glows with a green check mark. The flow repeats. Slow, calm, flat vector style, no people, no text, no logos, no sound. The first and last frames match so it loops.

### B2. The 60-second storyboard, one prompt per scene

Each clip is generated at the length shown, then edited together with the real screen recordings. Where a scene says **screen**, record the real app (`demo-script.en.md` Part B) and use the generated clip only as a short bridge.

| Scene | Length | Prompt |
|---|---|---|
| 1 (0–6 s) | 6 s | *Top-down view of a tidy wooden desk with a small loose pile of blank paper receipts and a closed notebook, soft morning light, slow push-in, no readable text, no people, no logos, no sound.* Then **screen**: the Dashboard in Arabic. |
| 2 (6–15 s) | 9 s | **Screen**: Scan Bill, drop a photo, **Read document**. Bridge: *A blank paper receipt icon slides in, a thin blue scanning line passes over it top to bottom, small dots appear where text would be. Flat vector, white background, no text.* |
| 3 (15–24 s) | 9 s | **Screen**: review, one flagged field corrected, **Create Bill**. Bridge: *A simple form with four empty rows; one row glows amber, then turns green. Flat vector, no text.* |
| 4 (24–32 s) | 8 s | **Screen**: Bills, two selected, **Approve & post**. Bridge: *Two document cards slide together, each gets a green check mark, then they slide into a closed ledger book icon. No text.* |
| 5 (32–40 s) | 8 s | **Screen**: quote → **Convert to Invoice** → **Record Payment**. Bridge: *A document card turns into a second card, then a coin icon fills half of a progress bar. No numbers, no text.* |
| 6 (40–48 s) | 8 s | **Screen**: Trial Balance in Arabic, then English. Bridge: *A balance scale settles level, slow and calm, flat vector, white and blue, no text.* |
| 7 (48–55 s) | 7 s | **Screen**: Settings → AI → **Connect your AI app**. Bridge: *Two rounded app tiles (abstract, no logos) linked by a thin blue line with a small padlock in the middle. No text.* |
| 8 (55–60 s) | 5 s | End card: *White background with a soft blue glow in the center, clean empty space for the real logo and the line «مجاني خلال الفترة التجريبية», added in editing. No text rendered by the model.* |

### B3. Editing checklist (after generation)
1. Add the real logo, the Arabic and English on-screen text from the storyboard table, and the voice-over lines.
2. Check every Arabic word letter by letter; if a generated frame contains any text, discard the clip.
3. Check no clip shows a logo, a face, a number or a UI that is not in the real product.
4. Export 16:9 and 9:16 (crop the screens to their 390 px recordings for 9:16).

_Sources: `apps/web/app/globals.css` (tokens), `docs/DESIGN-SYSTEM.md`, `docs/sales/demo-script.en.md`._
