# Layout Patterns & Responsibility

## 1. Primary Layout Modes

The application utilizes two distinct layout strategies based on screen size, fundamentally changing the scroll behavior.

### A. The Document Scroll (Mobile < 1024px)
*   **Behavior:** The entire browser window scrolls (`min-h-full`). The application behaves like a traditional website or a long-scrolling mobile app.
*   **Structure:** Vertical Flex Stacks (`flex-col`).
*   **Navigation:** Relies on global bottom padding (`pb-20` or `pb-24`) to prevent content from being obscured by fixed bottom navigation.
*   **Used By:**
    *   `AutoSyncer` (< lg)
    *   `Playground` (< lg)
    *   `BatchSender` (Always document scroll, grid internally)

### B. The Dashboard Grid (Desktop ≥ 1024px)
*   **Behavior:** The outer container is fixed to the viewport height (`h-[calc(100vh-80px)]`). Content panels scroll independently (`overflow-y-auto`). The browser window itself does not scroll.
*   **Structure:** CSS Grid (`grid-cols-3` or `grid-cols-12`).
*   **Navigation:** Top navigation bar (`sticky`). Bottom padding is removed (`lg:pb-0`).
*   **Used By:**
    *   `AutoSyncer` (≥ lg)
    *   `Playground` (≥ lg)

---

## 2. Page-Specific Implementations

### AutoSyncer (`src/pages/AutoSyncer.tsx`)

| Breakpoint | Layout | Scroll Strategy | Navigation Space |
| :--- | :--- | :--- | :--- |
| **Mobile** | `flex-col` | Document (`min-h-full`) | `pb-24` |
| **Desktop** | `grid-cols-3` (2 Col Content, 1 Col Stats) | Container (`h-[calc(100vh-80px)]`) | `lg:pb-0` |

### Playground (`src/pages/Playground.tsx`)

| Breakpoint | Layout | Scroll Strategy | Navigation Space |
| :--- | :--- | :--- | :--- |
| **Mobile** | `grid-cols-1` | Document | Default |
| **Desktop** | `grid-cols-12` (5 Col Sidebar, 7 Col Main) | Container (`lg:h-[calc(100vh-100px)]`) | Default |

### BatchSender (`src/pages/BatchSender.tsx`)

| Breakpoint | Layout | Scroll Strategy | Navigation Space |
| :--- | :--- | :--- | :--- |
| **Mobile** | `grid-cols-1` | Document | Default |
| **Desktop** | `grid-cols-2` | Document | Default |

---

## 3. Centralization vs Duplication

**Responsiveness is manually repeated in every page component.** There is no shared "PageLayout" component that handles the scroll behavior switch or padding logic.

*   **Risk:** Adding a new page requires manually implementing the `min-h-full` vs `h-screen` toggle and the `pb-24` padding logic.
*   **Inconsistency:** `BatchSender` does not switch to a fixed-height container on desktop like `AutoSyncer` does, leading to inconsistent scroll experiences between pages.
*   **Padding Logic:** The bottom padding (`pb-24`) is hardcoded in `AutoSyncer.tsx` and `ModernLayout.tsx`, creating a potential double-padding issue if not carefully managed.
