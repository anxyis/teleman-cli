# Layout Primitive Design: `<PageLayout>`

## 1. Problem Statement

Current pages (`AutoSyncer`, `Playground`) contain manual calculations for height (`h-[calc(100vh-80px)]`) and padding (`pb-24`), leading to:
*   **Fragmentation:** Each page implements its own scroll logic.
*   **Contract Violation:** `ModernLayout` adds bottom padding globally, while `AutoSyncer` removes it locally, causing layout bugs.
*   **Maintainability:** Changing the nav bar height requires editing every page.

## 2. Solution: Centralized Layout Container

We will introduce a **`<PageLayout>`** component that abstracts the responsive behavior entirely.

### Core Responsibilities
1.  **Mobile/Tablet (< 1024px):** Provide a `min-h-full` document scroll context with correct bottom padding (`pb-safe-nav`).
2.  **Desktop (≥ 1024px):** Provide a `h-screen` container with `overflow-hidden`, creating a fixed dashboard frame.
3.  **Slot Management:** Accept distinct `header`, `sidebar`, and `content` slots.

## 3. Strict Layout Rules (Non-Negotiable)

### A. No Hardcoded Heights
The `<PageLayout>` component **MUST NOT** rely on hardcoded pixel values (e.g., `h-[calc(100vh-64px)]`) for structural sizing.
*   **Why:** Hardcoding coupling layout to specific navigation implementations makes theme changes impossible and breaks when navigation changes size.

### B. CSS Variable Driven
All structural dimensions must be defined via CSS variables in the root theme:
*   `--h-header-mobile`: Height of the mobile top bar.
*   `--h-nav-mobile`: Height of the bottom navigation bar.
*   `--w-sidebar-desktop`: Width of the desktop sidebar.

### C. Flexbox Over Calc()
Layouts must utilize Flexbox (`flex-1`, `min-h-0`) to naturally fill available space. `calc()` should only be used as a last resort for specific overlays, not for main content areas.

### D. Navigation Propagation
Changes to navigation height (e.g., a taller sidebar item) must propagate automatically via the CSS variables or flex flow without requiring code changes in individual pages.

## 4. Proposed API

```tsx
interface PageLayoutProps {
  /** Main content area */
  children: React.ReactNode;

  /**
   * Desktop-only sidebar content.
   * On mobile, this might be rendered in a drawer or hidden.
   */
  sidebar?: React.ReactNode;

  /**
   * Page title/actions for mobile header.
   * On desktop, this might merge into the top bar or sidebar.
   */
  header?: React.ReactNode;

  /**
   * If true, disables the default container scroll on desktop
   * allowing children to manage their own scroll areas (e.g., chat apps).
   */
  disableScroll?: boolean;
}
```

## 5. Implementation Strategy

### Internal DOM Structure

```tsx
// Simplified Concept
export function PageLayout({ children, sidebar, header }: PageLayoutProps) {
  return (
    <div className="flex flex-col h-screen bg-canvas text-text-main">

      {/* Mobile Header (md:hidden) */}
      <div className="lg:hidden sticky top-0 z-40 bg-surface/80 backdrop-blur-md h-[var(--h-header-mobile)]">
        {header}
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* Desktop Sidebar (lg:block) */}
        {sidebar && (
          <aside className="hidden lg:flex w-[var(--w-sidebar-desktop)] flex-col border-r border-border bg-surface">
            {sidebar}
          </aside>
        )}

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col relative min-w-0">

          {/* Scroll Container */}
          <div className="flex-1 overflow-y-auto w-full p-4 lg:p-6 pb-[var(--h-nav-mobile)] lg:pb-6">
             {children}
          </div>

        </main>
      </div>
    </div>
  );
}
```

## 6. Migration Strategy

1.  **Create** `src/components/layout/PageLayout.tsx`.
2.  **Refactor** `AutoSyncer.tsx`:
    *   Remove `min-h-full`, `pb-24`, and manual grid containers.
    *   Wrap content in `<PageLayout>`.
    *   Move "System Status" panel into the `sidebar` prop.
3.  **Refactor** `Playground.tsx`:
    *   Use `<PageLayout disableScroll>` to maintain its internal complex grid.

## 7. Risk Assessment

*   **Custom Scrollbars:** Ensure the new `overflow-y-auto` container styles match the global theme.
*   **Virtual Lists:** If pages use window virtualization, moving to a container scroll might break scroll position logic. (Current app uses standard lists, risk low).
