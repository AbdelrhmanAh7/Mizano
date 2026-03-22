# Mizano ERP — Brand Assets

## Brand Colors

| Name           | Hex       | Usage                                     |
| -------------- | --------- | ----------------------------------------- |
| Primary        | `#0D9488` | Main brand color, buttons, active states  |
| Primary Dark   | `#085041` | Hover states, gradients                   |
| Primary Light  | `#5DCAA5` | Highlights, badges                        |
| Primary BG     | `#E1F5EE` | Light backgrounds, cards                  |
| Accent (Gold)  | `#EF9F27` | CTAs, important highlights, notifications |
| Accent Dark    | `#854F0B` | Accent hover/pressed                      |
| Text           | `#2C2C2A` | Body text                                 |
| Text Secondary | `#5F5E5A` | Muted text, captions                      |

## Logo Variants

| File                     | Usage                              |
| ------------------------ | ---------------------------------- |
| `logo-full.svg`          | Primary horizontal logo (light bg) |
| `logo-full-dark.svg`     | Horizontal logo (dark bg)          |
| `logo-icon.svg`          | Square icon mark                   |
| `logo-icon-circle.svg`   | Circular avatar/social             |
| `logo-wordmark.svg`      | Text-only (light bg)               |
| `logo-wordmark-dark.svg` | Text-only (dark bg)                |
| `logo-stacked.svg`       | Icon above text (light bg)         |
| `logo-stacked-dark.svg`  | Icon above text (dark bg)          |
| `safari-pinned-tab.svg`  | Safari pinned tab (monochrome)     |

## Icon Sizes

| File                   | Size     | Usage                  |
| ---------------------- | -------- | ---------------------- |
| `favicon.ico`          | 16/32/48 | Browser tab            |
| `icon-16x16.png`       | 16×16    | Small favicon          |
| `icon-32x32.png`       | 32×32    | Standard favicon       |
| `icon-192x192.png`     | 192×192  | PWA icon               |
| `icon-512x512.png`     | 512×512  | PWA splash / hi-res    |
| `apple-touch-icon.png` | 180×180  | iOS home screen        |
| `og-image.png`         | 1200×630 | Social sharing         |
| `avatar.png`           | 512×512  | Social profile picture |

## Typography

- **Primary font**: Instrument Sans (Google Fonts, free)
- **Fallback**: DM Sans → Nunito Sans → system-ui
- **Wordmark weight**: 700
- **Body weight**: 400–500

## Installation

Copy `head-snippet.html` contents into your `<head>` tag.
Copy `manifest.json` to your public root.
Place icons in `/public/icons/` and social images in `/public/images/`.
