# DESIGN_TOKENS.md — Boardly Design System

Canonical design tokens for the entire product. These values are defined once in `packages/config/tailwind-preset.ts` and consumed by:
- `packages/ui` (web — shadcn/ui components)
- `packages/ui-native` (mobile — React Native Reusables + NativeWind)
- `apps/dashboard` (Vite + React)
- `apps/website` (Next.js)

**Rule:** Never hardcode a hex color, pixel value, or font name directly in a component. Always use a token. Company Admin white-label theming (architecture doc §6) depends on this — one token change must cascade everywhere without touching component code.

---

## 1. Color Palette

### Brand Colors
These are Boardly's fixed brand colors. They do not change per tenant.

| Token | Hex | Usage |
|---|---|---|
| `brand-50` | `#eef2ff` | Lightest tint, hover states on light BG |
| `brand-100` | `#e0e7ff` | Subtle backgrounds, badges |
| `brand-200` | `#c7d2fe` | Borders, dividers on white |
| `brand-300` | `#a5b4fc` | Disabled state accents |
| `brand-400` | `#818cf8` | Secondary interactive elements |
| `brand-500` | `#6366f1` | **Primary brand color** — buttons, links, focus rings |
| `brand-600` | `#4f46e5` | Button hover state |
| `brand-700` | `#4338ca` | Button active/pressed state |
| `brand-800` | `#3730a3` | Dark accent, icon fills |
| `brand-900` | `#312e81` | Darkest, text on light backgrounds only |
| `brand-950` | `#1e1b4b` | Near-black brand tint |

### Semantic Colors (light mode)

| Token | Hex | Usage |
|---|---|---|
| `success-500` | `#22c55e` | Success states, "Done" stage category |
| `success-100` | `#dcfce7` | Success background |
| `warning-500` | `#f59e0b` | Warning states, "Blocked" stage category |
| `warning-100` | `#fef3c7` | Warning background |
| `danger-500` | `#ef4444` | Error states, destructive actions |
| `danger-100` | `#fee2e2` | Error background |
| `info-500` | `#3b82f6` | Info states, tooltips |
| `info-100` | `#dbeafe` | Info background |

### Stage Category Colors
Used for stage chips/badges throughout the UI. Maps to `stages.category` in the DB.

| Category | Token | Hex | Example stages |
|---|---|---|---|
| `not_started` | `stage-not-started` | `#94a3b8` | "Backlog", "To Do", "Assigned to Dev" |
| `in_progress` | `stage-in-progress` | `#6366f1` | "In Progress", "Under Testing", "In Review" |
| `blocked` | `stage-blocked` | `#f59e0b` | "Blocked", "On Hold", "Discussion Required" |
| `done` | `stage-done` | `#22c55e` | "Done", "Ready to Release", "Finished" |

### Neutral / Surface Colors

| Token | Light mode | Dark mode | Usage |
|---|---|---|---|
| `surface-base` | `#ffffff` | `#0f172a` | App background |
| `surface-raised` | `#f8fafc` | `#1e293b` | Cards, panels, sidebars |
| `surface-overlay` | `#f1f5f9` | `#334155` | Modals, dropdowns |
| `surface-border` | `#e2e8f0` | `#334155` | All borders and dividers |
| `surface-hover` | `#f1f5f9` | `#334155` | Hover on list items |
| `text-primary` | `#0f172a` | `#f8fafc` | Primary readable text |
| `text-secondary` | `#475569` | `#94a3b8` | Labels, captions, metadata |
| `text-disabled` | `#94a3b8` | `#64748b` | Disabled inputs, placeholder text |
| `text-inverse` | `#ffffff` | `#0f172a` | Text on colored backgrounds |

### Theme Palettes

Boardly supports 6 theme palettes customizable via the Appearance settings and stored in `localStorage`:

| Palette ID | Name | Background | Card Surface | Accent Highlight | Description |
|---|---|---|---|---|---|
| `default` | Classic Zinc | `#0f172a` | `#1e293b` | `#818cf8` | High-contrast grayscale dark mode |
| `midnight` | Midnight OLED | `#000000` | `#09090b` | `#6366f1` | Pitch black optimized for OLED displays |
| `ocean` | Oceanic Azure | `#0b132b` | `#111d40` | `#38bdf8` | Deep navy twilight slate with cyan glow |
| `forest` | Emerald Forest | `#061914` | `#0c2921` | `#10b981` | Pine & dark moss with vibrant mint green |
| `synthwave` | Synthwave Sunset | `#120826` | `#1c0d3a` | `#f43f5e` | Cyberpunk dark violet with neon magenta |
| `nordic` | Nordic Frost | `#1e2530` | `#273140` | `#88c0d0` | Arctic slate with chilled ice-blue tones |

### Primary Accent Presets

Users can customize their primary interactive color independently of the surface palette:
- **Indigo (Default)**: `#6366f1`
- **Sky Blue**: `#0284c7`
- **Emerald Green**: `#10b981`
- **Neon Violet**: `#8b5cf6`
- **Rose Crimson**: `#f43f5e`
- **Amber Glow**: `#f59e0b`
- **Custom HEX**: Any arbitrary 6-character hex code for corporate branding

---

## 2. Typography

### Font Families

| Token | Value | Usage |
|---|---|---|
| `font-sans` | `'Inter', system-ui, sans-serif` | **Primary** — all UI text |
| `font-mono` | `'JetBrains Mono', 'Fira Code', monospace` | Code blocks, IDs, technical strings |

Import in `apps/dashboard/index.html` and `apps/website/app/layout.tsx`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

### Font Size Scale

| Token | Size | Line height | Usage |
|---|---|---|---|
| `text-xs` | `12px / 0.75rem` | `16px` | Timestamps, metadata badges |
| `text-sm` | `14px / 0.875rem` | `20px` | Labels, captions, secondary text |
| `text-base` | `16px / 1rem` | `24px` | Body text, card titles |
| `text-lg` | `18px / 1.125rem` | `28px` | Panel headings, emphasis |
| `text-xl` | `20px / 1.25rem` | `28px` | Page section headers |
| `text-2xl` | `24px / 1.5rem` | `32px` | Page titles |
| `text-3xl` | `30px / 1.875rem` | `36px` | Marketing hero subtitles |
| `text-4xl` | `36px / 2.25rem` | `40px` | Marketing hero headline |

### Font Weight

| Token | Value | Usage |
|---|---|---|
| `font-normal` | `400` | Body text |
| `font-medium` | `500` | Labels, nav items, secondary UI |
| `font-semibold` | `600` | Headings, button text, card titles |
| `font-bold` | `700` | Hero headlines, emphasis |

---

## 3. Spacing Scale

Using Tailwind's default 4px base unit. Reference values for common layout decisions:

| Token | Value | Common usage |
|---|---|---|
| `space-1` | `4px` | Icon padding, tight gaps |
| `space-2` | `8px` | Inline gaps between small elements |
| `space-3` | `12px` | Small component padding |
| `space-4` | `16px` | Standard padding — inputs, buttons, list items |
| `space-5` | `20px` | Card internal padding |
| `space-6` | `24px` | Section gaps, modal padding |
| `space-8` | `32px` | Panel padding, page section gaps |
| `space-10` | `40px` | Large section gaps |
| `space-12` | `48px` | Page top padding |
| `space-16` | `64px` | Hero sections, marketing page spacers |

---

## 4. Border Radius

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | `4px` | Badges, tags, small chips |
| `radius-md` | `6px` | Inputs, buttons |
| `radius-lg` | `8px` | Cards, dropdowns, panels |
| `radius-xl` | `12px` | Modals, large cards |
| `radius-2xl` | `16px` | Hero cards on marketing site |
| `radius-full` | `9999px` | Avatars, pills, toggle switches |

---

## 5. Shadows

| Token | Value | Usage |
|---|---|---|
| `shadow-xs` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift on hovered list items |
| `shadow-sm` | `0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)` | Cards, buttons |
| `shadow-md` | `0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06)` | Dropdowns, popovers |
| `shadow-lg` | `0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)` | Modals, floating panels |
| `shadow-xl` | `0 20px 25px rgba(0,0,0,0.1), 0 10px 10px rgba(0,0,0,0.04)` | Marketing hero cards |
| `shadow-brand` | `0 0 0 3px rgba(99,102,241,0.4)` | Focus rings (keyboard nav) — use brand-500 at 40% opacity |

---

## 6. Animation / Transitions

| Token | Duration | Easing | Usage |
|---|---|---|---|
| `transition-fast` | `100ms` | `ease-out` | Hover color changes, icon state changes |
| `transition-base` | `150ms` | `ease-out` | Button active states, focus rings |
| `transition-slow` | `200ms` | `ease-in-out` | Dropdown open/close, panel slide |
| `transition-modal` | `300ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Modal appear (spring feel) |

**Principle:** The dashboard is a daily-use productivity tool. Animations should be **subtle and quick** (≤200ms). Reserve longer/more dramatic animations for the marketing website where first impressions matter.

---

## 7. Z-Index Scale

| Token | Value | Layer |
|---|---|---|
| `z-base` | `0` | Normal document flow |
| `z-raised` | `10` | Cards being dragged |
| `z-dropdown` | `100` | Dropdown menus, popovers |
| `z-sticky` | `200` | Sticky headers, sidebar |
| `z-overlay` | `300` | Modal backdrop |
| `z-modal` | `400` | Modal content |
| `z-toast` | `500` | Toast notifications (always on top) |

---

## 8. Component-Level Design Decisions

### Kanban Board
- Card background: `surface-raised`
- Card border: `1px solid surface-border`
- Card border-radius: `radius-lg` (8px)
- Card shadow: `shadow-sm` at rest, `shadow-md` while dragging
- List header: `text-sm font-semibold text-secondary`
- List background: `surface-overlay` (slightly darker than board background)
- Column width: `280px` fixed (scrollable horizontally)

### Sidebar Navigation
- Background: `surface-raised`
- Active item: `brand-50` background (light mode) / `brand-950` (dark mode), `brand-600` text
- Hover: `surface-hover`
- Icon size: `20px` (5 in Tailwind units)
- Width: `240px` expanded, `64px` collapsed

### Buttons
| Variant | Background | Text | Border | Hover |
|---|---|---|---|---|
| Primary | `brand-500` | `text-inverse` | none | `brand-600` |
| Secondary | `surface-raised` | `text-primary` | `surface-border` | `surface-hover` |
| Destructive | `danger-500` | `text-inverse` | none | `danger-600` |
| Ghost | transparent | `text-secondary` | none | `surface-hover` |
| Link | transparent | `brand-500` | none | underline |

### Avatars
- Border-radius: `radius-full`
- Sizes: `20px` (xs), `24px` (sm), `32px` (md), `40px` (lg), `48px` (xl)
- Fallback: initials on `brand-100` background (light) / `brand-900` (dark)
- Overlap stacking in avatar groups: `-8px` margin-left, `z-index` stacked

---

## 9. White-Label Theming (per-tenant)

Company Admin branding overrides the following tokens only — everything else stays as Boardly defaults:

| Token overridden | What it controls |
|---|---|
| `brand-500` | Primary buttons, links, active nav items, focus rings |
| `brand-600` | Button hover |
| `brand-700` | Button active/pressed |
| Org logo | Replaces Boardly logo in sidebar and emails |
| Custom domain | `acme.boardly.com` (handled at infra layer, not CSS) |

**Implementation:** Store overrides as JSON in `organizations.primary_color` (and future `organizations.branding_config` JSONB column). Inject as CSS custom properties on the root element at app load:

```typescript
// Applied in apps/dashboard/src/main.tsx after fetching org config
document.documentElement.style.setProperty('--color-brand-500', orgBrandColor);
```

This means all Tailwind classes using `brand-*` tokens automatically respect per-tenant colors without rebuilding CSS.

---

## 10. Tailwind Preset Structure

Location: `packages/config/tailwind-preset.ts`

```typescript
import type { Config } from 'tailwindcss';

const preset: Config = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: 'var(--color-brand-50, #eef2ff)',
          // ... all brand tokens
          500: 'var(--color-brand-500, #6366f1)',
          // ...
        },
        surface: {
          base: 'var(--color-surface-base)',
          raised: 'var(--color-surface-raised)',
          // ...
        },
        // ... all other tokens
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
        '2xl': '16px',
      },
      boxShadow: {
        brand: '0 0 0 3px rgba(99,102,241,0.4)',
      },
    },
  },
  plugins: [],
};

export default preset;
```

Every app extends this preset in its own `tailwind.config.ts`:
```typescript
import preset from '@boardly/config/tailwind';
export default { presets: [preset], content: ['./src/**/*.{ts,tsx}'] };
```
