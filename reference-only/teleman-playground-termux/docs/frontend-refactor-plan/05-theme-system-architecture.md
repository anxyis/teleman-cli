# Theme System Architecture: Scalable Design

## 1. Problem Statement

*   **Fragmentation:** Current theming mixes CSS variables (`--color-surface`), Tailwind utility classes (`bg-slate-900`), and hardcoded hex values in `index.css`.
*   **Legacy Burden:** The "Legacy Mode" theme adds complexity (`[data-theme="legacy"]`) and supports an outdated color palette.
*   **Font Conflict:** Custom font logic (`Gilroy` vs `JetBrains Mono`) is handled via imperative `!important` overrides.

## 2. Solution: Semantic Token System

We will implement a strictly semantic token system using CSS Variables and Tailwind v4 `@theme`.

### Core Principles
1.  **Semantic Naming:** Use `bg-surface`, `text-primary`, `border-muted` instead of specific color names.
2.  **Theme Agnostic:** Components consume *tokens*, never raw values.
3.  **Scoped Context:** Themes are applied via `data-theme` attributes on the `<body>` or root element.

## 3. Strict Enforcement (Non-Negotiable)

**Layout Components (`PageLayout`, `ResponsiveModal`, `ModernSidebar`) MUST NOT use raw color classes or hex values.**

### Forbidden Patterns:
*   `bg-slate-900` / `bg-white` / `bg-black`
*   `text-gray-500` / `text-blue-600`
*   `border-[#333]`

### Mandatory Patterns:
*   `bg-surface` / `bg-canvas`
*   `text-text-main` / `text-text-muted`
*   `border-border`

**Why?**
If core layout components depend on specific color palettes (e.g., "slate"), swapping to a new theme (e.g., "Solarized" or "OLED Black") becomes impossible without rewriting the structural code. Theme isolation is critical for long-term scalability.

## 4. Token Architecture

### Base Tokens (Primitives)

```css
:root {
  /* Core Palette (Base Theme - Slate) */
  --p-slate-50: #f8fafc;
  --p-slate-900: #0f172a;
  --p-slate-950: #020617;

  /* Core Palette (Modern Theme - AMOLED) */
  --p-black: #000000;
  --p-gray-900: #121212;
  --p-purple-400: #c084fc;
}
```

### Semantic Tokens (Aliases)

```css
@theme {
  /* Backgrounds */
  --color-canvas: var(--color-canvas);       /* App Background */
  --color-surface: var(--color-surface);     /* Card / Panel Background */
  --color-surface-hover: var(--color-surface-hover);

  /* Text */
  --color-text-main: var(--color-text-main);
  --color-text-muted: var(--color-text-muted);

  /* Brand */
  --color-primary: var(--color-primary);
  --color-primary-fg: var(--color-primary-fg);

  /* Status */
  --color-success: var(--color-success);
  --color-error: var(--color-error);
}
```

## 5. Theme Definitions

### Modern (Default)

```css
[data-theme="modern"] {
  --color-canvas: #000000;
  --color-surface: #121212;
  --color-surface-hover: #1e1e1e;

  --color-text-main: #ffffff;
  --color-text-muted: #a1a1aa;

  --color-primary: #c084fc; /* Purple-400 */
  --color-primary-fg: #000000;
}
```

### Classic (Slate Blue)

We will rename "Legacy" to "Classic" and implement it strictly via the new token system.

```css
[data-theme="classic"] {
  --color-canvas: #020617; /* Slate-950 */
  --color-surface: #0f172a; /* Slate-900 */
  /* ... */
}
```

## 6. Migration Strategy

1.  **Audit:** Scan codebase for hardcoded colors (e.g., `bg-slate-800`, `text-blue-500`).
2.  **Replace:** Swap hardcoded classes with semantic tokens (`bg-surface`, `text-primary`).
3.  **Refactor `index.css`:** Implement the new CSS Variable structure.
4.  **Update `ThemeContext`:** Remove "Legacy Mode" logic that toggles layout components. Theming should only toggle CSS variables.

## 7. Risk Assessment

*   **Visual Regression:** High risk of minor color mismatches during migration. Use visual regression testing (Snapshot tests).
*   **Contrast Ratios:** Ensure both Modern and Classic themes meet accessibility standards (WCAG AA).
