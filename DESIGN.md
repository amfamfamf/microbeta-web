# Micro-Beta design system: Mono ice

**Source of truth:** [Micro-Beta Design System (artifact)](https://claude.ai/artifact/STyFzHX4CzP71sGVpnSg5D)
— spec sheet with live previews, phone and desktop frames. In that page, the system is
`data-system="mono" data-brand="ice"`: black-and-white technical structure with one ice-blue brand color.

**In code:** [`src/styles/tokens.css`](src/styles/tokens.css) holds every token. [`src/styles.css`](src/styles.css)
holds the components and uses only those tokens. Canvas overlay colors are in `COLORS` in
[`src/lib/overlay.ts`](src/lib/overlay.ts) and must match the `--ov-*` tokens.

When the artifact changes: update `tokens.css` first, then components, then this file.

## Color

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F0FBFF` Ice 50 | `#06131C` | Page |
| `--surface` | `#FFFFFF` | `#0B1F2B` | Inputs, chips on cards |
| `--surface-2` | `#DDF4FD` Ice 100 | `#12293A` | Cards, alerts (the one card style) |
| `--border` | `#C3E4F1` | `#1E3A4E` | Hairlines only |
| `--text` | `#06283A` Deep 900 | `#EAF8FF` | Text |
| `--text-muted` | `#3F6577` | `#9FC7D9` | Secondary text |
| `--primary` / `--on-primary` | `#06283A` / `#FFF` | `#8EE3FF` / `#06131C` | Primary button |
| `--accent` | `#0A7FA8` Glacier 700 | `#8EE3FF` | Links, focus ring |
| `--cog` | `#8EE3FF` Ice 300 | same | The one brand color: COG dot, active marker, scrubber thumb |
| `--success` / `--warning` / `--danger` | `#2E7D32` / `#8A5A00` / `#A4161A` | `#4CAF50` / `#E0A526` / `#FF8A80` | Status. Danger = errors only, always with an icon |

**Video overlay (same in both themes):** skeleton `#FFF`, COG `#8EE3FF` with glow, reach `#FFF`,
fall/outside `#B2B2B2`, outline `#06283A`. Line style always differs as well as color
(plumb = dashed, target hold = thick outline, tapped hold = ice outline, joint angle = ice arc + label).
Overlay layers: skeleton (no face points) and COG always; plumb line, reach/target and joint angles only for the
selected cue (`layersFor` in `src/lib/overlay.ts`). Base of support is never drawn.

Rules:
- Ice 300 is never text on a light background. On light screens it always has a Deep 900 outline or Deep 900 text on it.
- Red never stands for the brand.
- One primary-colored element per screen. Other buttons are `.btn.ghost`.
- Check every text/background pair against WCAG AA (4.5:1 body, 3:1 large text and icons).

## Type

| Role | Font | Size / line | Notes |
|---|---|---|---|
| Hero (landing h1) | `--font-hero`: Columna → **Cinzel** | 40/42 | Uppercase, 0.05em |
| H1, wordmark | `--font-glyph`: Friz Quadrata → **Marcellus** | 40/44 (logo 17/20) | Uppercase, 0.04em (logo 0.08em), weight 400 |
| H2, cue title | Barlow 600 | 22/28 (cue 19/25, secondary cue 18/22.5) | Sentence case |
| Eyebrow / h3 / category | Barlow 500 | 11/14 | Uppercase, 0.14em, muted |
| Body | Barlow 400 | 16/24 | Artifact says 15/22.5; we use 16 to meet its own "body ≥ 16 px" rule |
| Numbers | Barlow, `tabular-nums` | — | Ice drops mono type for numbers |

Columna and Friz Quadrata are commercial. **Buy desktop + web licenses before launch.** Until then the
open fallbacks (Cinzel, Marcellus, Barlow) load from Google Fonts in `index.html`.

## Shape, spacing, motion

- **Shape rule (v2): three radii only.**
  - `--r-pill` (full): anything you tap — every button, input, chip, toggle. Icon buttons are circles.
  - `--r-card` (16 px): anything that holds content — cards, alerts, upload area, video.
  - `--r-inner` (8 px): media or labels inside a container — thumbnails, labels on the video.
  - Tape tags keep their cut ends. A control next to a control always has the same shape.
- Buttons: large 52 (primary, full width, bottom of screen), medium 44 (default), small 36 (chips, inline).
  Pressed = darker + `scale(.98)`. Disabled = 40% opacity. Focus = 2 px `--accent` ring.
- Side padding (`--gutter`): 16 px mobile, 24 px ≥ 640, 32 px ≥ 1024.
- Cards: filled `--surface-2`, no outline, no shadow. Alerts: same fill plus a 3 px colored left edge.
- Top bar: frosted (`--frost`, blur 14 px).
- Motion: fast 120 ms, base 200 ms. Respect `prefers-reduced-motion`.
- Loader and logo: the COG dot over a dashed plumb line.

## Components (class → spec)

| Class | Spec component |
|---|---|
| `.btn`, `.btn.ghost`, `.btn.small`, `.btn.wide` | Primary, secondary, small, large (all pills) |
| `.card`, `.cue-card`, `.job-row` | One card style |
| `.badge.high` / `.badge.med` | Confidence: filled ice dot / hollow ring, always with text |
| `.pill.ready` / `.pill.analyzing` / `.pill.failed` | Status chips that differ by shape: dot / pulsing ring / ✕ |
| `.banner.warn` / `.error` / `.info` | Upload warning / error / note |
| `.stepper` | Job status (Uploaded → Analyzing → Ready) |
| `.scrubber-*`, `.cue-marker` | Video scrubber: ice thumb, dashed fall mark, cue markers |

## Voice

Cues are commands of 12 words or fewer: body part + action ("Drop your left knee before you reach.").
Errors say what happened and what to do ("Your feet left the frame at 0:12. Step back and film again.").
No grade shaming.

## Accessibility

Tap targets ≥ 44 × 44 px. Never color alone: badges carry text, overlay lines differ in style.
Every cue is also text below the video. Follow light/dark and reduce-motion settings.
