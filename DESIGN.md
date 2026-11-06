# Squeek Studio design

## Overview

Squeek Studio is a browser art tool for holders and people previewing fully on-chain Squeeks. Its visual idea is a quiet paper studio around a colorful dot-grid character: warm neutral surfaces, green ink, a coral creation action, and a small stack of real rendered art on the landing page. The editor prioritizes the preview and export, with settings beside it on desktop and below it on mobile. No external fonts, imagery, or Squeekchain logo are used.

The implementation lives in `src/style.css`, `src/App.tsx`, `src/components/Preview.tsx`, and `src/lib/render.ts`. UI copy, including EN and VI variants, is centralized in `src/i18n.ts`.

## Colors

The source uses hex values and semantic CSS custom properties. Components consume the role tokens; the `[data-theme=dark]` block changes the entire theme, with localStorage retaining the visitor's choice. The initial choice follows the system preference.

| Token | Light | Dark | Job |
| --- | --- | --- | --- |
| `--bg` | `#f8f7f2` | `#1a1e19` | Page background |
| `--surface` | `#fffef9` | `#222820` | Fields and wallet sheet |
| `--soft` | `#eeede5` | `#2b3228` | Secondary areas, stage, footer |
| `--ink` | `#2b3227` | `#f0efe4` | Main text and icons |
| `--muted` | `#61675b` | `#b6bdae` | Supporting text |
| `--line` | `#d8dacf` | `#495244` | Structural borders |
| `--accent` | `#e77e64` | `#e99c80` | Main create/download action |
| `--accent-hover` | `#db6b50` | `#f2ad93` | Primary hover state |
| `--accent-ink` | `#272a20` | `#22291e` | Text on primary buttons |
| `--sage` | `#dce3cc` | `#34442c` | Selection and export group |
| `--sage-ink` | `#3b4d32` | `#d2e4bc` | Text associated with selection |
| `--error` | `#a03528` | `#ffc3ae` | Error text |
| `--error-bg` | `#fae6df` | `#492d25` | Error message surface |
| `--focus` | `#435d9d` | `#b2c5ff` | Keyboard outline |

The canvas renderer has its own artwork colors, derived from actual SVG fills/group colors. Background tints mix these with template base colors; a dark circular field preserves pale glyph visibility on light templates. Export text selects a contrasting ink for custom backgrounds. Bronze/silver/gold/neon frames and 7/30/90-day ribbons encode explicit data tiers rather than UI action priority. Foil uses a generated diagonal gradient; wheel glow requires a fresh ACTIVE measurement. Measured UI contrast and unmeasured artwork combinations are distinguished in `artifacts/validation.md`.

## Typography

One local system sans stack: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Address disclosures use the platform monospace stack. No font files or network font requests are needed. UI weights are 400 and 600.

| Token | Size | Usage |
| --- | --- | --- |
| `--xs` | 12px | Captions, dimensions, compact metadata |
| `--sm` | 14px | Navigation, controls, labels, help |
| `--body` | 16px | Body copy and input text |
| `--h3` | 24px | Section headings and desktop brand |
| `--h2` | 40px | Page titles and mobile hero |
| `--h1` | 64px | Large desktop landing headline |

Body line-height is 1.55, help is 1.5, headings are 1.15, and the landing headline is 1.05 (1.08 on mobile). Headings use balanced wrapping and negative display tracking; content has natural tracking and case. Prose uses pretty wrapping and bounded measures. Changing numbers use tabular numerals. Mobile inputs stay at 16px. Long public holder addresses wrap and have a full disclosure, rather than being clipped.

Canvas typography is specified separately in the renderer because export coordinates are full-resolution pixels, not CSS pixels. It uses the same system sans family and 400/600 weights.

## Layout

`.shell` is the shared alignment primitive: max 1240px with 48px side margins by default; above 1500px it grows to max 1320px with 60px margins. Below 1120px margins become 32px; below 640px, 18px; below 359px, 14px. The main UI uses 8–12px within compact control groups, 16–24px between related content, and 28–42px between editor columns or larger groups. Sections receive 38px vertical space on phones and 70px on desktop.

The landing hero is a two-column composition; at 640px it stacks copy, token input/action, and a compact art collage. Its product description and primary preview action remain on the first 390px-wide screen. The header becomes two rows at 850px, preserving the brand and wallet control on the leading row and visible navigation below. Theme control moves to the footer on phones; language remains in the header.

The editor uses a flexible preview and 320px settings column, narrowing through 290px and 260px, then stacks at 640px. Format buttons become a 3×2 grid on phones. Full resolution images scale to the available stage without changing export dimensions. Guide percentages derive from `layout()` in `src/lib/core.ts`. The gallery moves from four to three to two columns; filters wrap. The public Squeek and About pages become one column on phones. The footer wraps its links naturally. Existing rendered evidence covers 320, 390, 768, and 1440px; final verification documents any additional widths.

## Elevation & Depth

Most UI uses whitespace, tonal groups, and structural dividers. A surface does not receive both a decorative border and a shadow. The hero's physical print stack and the art stage use restrained shadows to separate artwork from its background. The native wallet dialog uses a stronger shadow, an overlay, and backdrop blur. There is no page-load animation, animated gradient, or endless motion.

## Shapes

`--radius: 14px` is the large shared radius for stages and artwork groups. Buttons use 9px; fields 8px; small badges 5–6px; wallet dialog 18px. Selection is indicated by a sage surface or an outline and a check. The only large circles are character framing, palette controls, the safe-zone guide, and the wheel illustration. Image clipping is intentional inside decorative previews, not on data values or actions.

## Components

- **Button patterns** (`src/style.css`): `.button.primary` for create/download; `.button.secondary` for wallet and supporting actions; `.text-button` for low-emphasis commands; `.icon-button` for named icon utilities. Controls have hover, active, focus, pending/disabled states. Minimum touch targets are 44px; larger actions are 48px. Under reduced motion, press scaling is absent.
- **Header/navigation** (`App.tsx`): brand links home, hash links remain visible on phones, selected page receives an underline, wallet control shows the connected short address or chain-switch action. Disconnect has an accessible name.
- **`TokenForm`** (`App.tsx`): persistent token-ID label, numeric keyboard, submit validation, inline error, invalid-field focus, and an adjacent preview action. The compact variant appears in the studio.
- **`Preview`** (`components/Preview.tsx`): asynchronously creates a local PNG; loading/failure state is textual; safe zones are optional overlays and not exported. Guides use the ink/background pair for a dual outline and solid caption backing across artwork colors. Blob URLs are released when replaced. Sticker previews use the same renderer.
- **Format/template selection** (`App.tsx`): native buttons in labeled groups with `aria-pressed`; eight palette-backed template samples, a check for selected template, keyboard focus ring. They are not custom tab widgets.
- **Fields** (`App.tsx`, `.field`): visible labels, text limits, 16px mobile inputs, native range, native checkbox and color picker. The selected color can be reset to the Squeek palette.
- **`FactsList`, `Traits`, `ErrorBox`** (`App.tsx`): real values, explicit unknown/cached states, rarest-trait highlight, recoverable error and retry. Unknown data does not become a zero or a qualifying badge.
- **Wallet sheet** (`WalletDialog` in `App.tsx`): native `<dialog>` for focus containment, Escape and backdrop dismissal, focus return, per-provider pending state, and a no-wallet explanation. It is centered on desktop and bottom aligned under 640px.
- **Gallery tiles** (`Gallery`): actual on-chain SVG image, token name, palette value, and a real public-page link. Trait filters use native selects with explicit accessible names. Loading, no match, partial data, cached data, and failure states remain distinct.
- **Export group** (`Studio`): PNG or six-file ZIP download, clipboard, native sharing, and X intent. Success/support errors use a stable polite status region. Sharing may need a second deliberate gesture once files are prepared.
- **Icons** (`components/Icon.tsx`): local 1.7px outline SVG set using `currentColor`; decorative icons are hidden from assistive technology. The site mark is original code, not a Squeekchain logo.

## Do's and Don'ts

Start additional pages with `.shell` and the existing heading hierarchy. Put new UI strings in both languages in `src/i18n.ts`. Reuse the six type sizes and semantic color tokens. Keep one main creation/download action visually dominant and keep a recovery action adjacent to errors. Use actual custody and freshness checks for data decoration. Keep RPC addresses in `chain.ts`, not in presentation components.

Do not add external fonts, image services, analytics, a wallet relay, or transaction controls. Do not infer ownership from an API custody label or cached data. Do not paint safe-zone guides into export assets or silently turn missing data into zero. Avoid clipping long metadata, hiding navigation behind a mobile menu, or introducing a second button/field system.

The final six-domain review and verification limitations are recorded separately in `artifacts/validation.md`. Design guidance attribution is retained in `THIRD_PARTY_NOTICES.md` and `licenses/interface-guides.txt`.
