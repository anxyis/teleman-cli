# Controlled Refactor Roadmap

## Phase 1: Foundation (Zero Breaking Changes)

### Step 1.1: Create Base Components
*   Create `src/components/layout/PageLayout.tsx`.
*   Create `src/components/common/ResponsiveModal.tsx`.
*   Create `src/components/navigation/ModernSidebar.tsx`.
*   **Verify:** These components should exist but not be used yet.

### Step 1.2: Implement Theme Tokens
*   Update `src/index.css` with the new semantic token structure.
*   Update `ThemeContext` to support the new "Classic" theme (alongside Legacy for now).
*   **Verify:** UI should look identical, but tokens are available.

## Phase 2: Layout Migration (Incremental)

### Step 2.1: Migrate AutoSyncer Page
*   Wrap `AutoSyncer` content in `<PageLayout>`.
*   Remove manual padding/height logic.
*   Move "System Status" panel to `<PageLayout sidebar={...} />`.
*   **Verify:** Check layout on Mobile, Tablet, and Desktop. Ensure scrolling works correctly.

### Step 2.2: Migrate Playground Page
*   Wrap `Playground` content in `<PageLayout disableScroll>`.
*   Verify grid layout integrity.

## Phase 3: Modal Unification

### Step 3.1: Migrate Database & Targets Managers
*   Replace manual modal wrappers with `<ResponsiveModal>`.
*   **Verify:** Check transition from Full-Screen (Mobile) to Centered (Desktop) at `md:` breakpoint.

### Step 3.2: Migrate PresetManager
*   Refactor `PresetManager` to use `<ResponsiveModal>`.
*   Ensure internal split-pane logic still functions correctly.

## Phase 4: Navigation Repair

### Step 4.1: Enable Sidebar
*   Update `AppLayout` (ModernLayout) to render `<ModernSidebar>` on desktop (`lg:`).
*   Hide `<ModernBottomNav>` on desktop (`lg:hidden`).
*   Add `lg:pl-[var(--w-sidebar-desktop)]` to the main content area.

### Step 4.2: Remove Legacy Layout
*   Delete `LegacyLayout.tsx` and `LegacyNavbar.tsx`.
*   Update `App.tsx` to use only `AppLayout`.
*   Remove "Legacy Mode" toggle from Settings (repurpose as "Classic Theme").

## Phase 5: Cleanup & Polish

### Step 5.1: Audit & Delete
*   Remove unused CSS classes.
*   Delete old component files.

### Step 5.2: Accessibility Check
*   Verify focus management in new modals.
*   Verify color contrast in new themes.

## 6. Verification Checkpoints (Explicit Risks)

### Risk 1: Double Scroll Context Bugs
*   **Checkpoint:** Open `AutoSyncer` on Mobile.
*   **Verify:** `window.scrollY` behaves as expected (document scroll).
*   **Verify:** Navigating to an anchor (if any) scrolls the correct container.
*   **Verify:** No nested `overflow-y-auto` divs inside the main document scroll area.

### Risk 2: Sidebar Interaction Density
*   **Checkpoint:** Open App on Desktop (`lg:`).
*   **Verify:** Main content width (after `pl-64` shift) is still usable and not too narrow.
*   **Verify:** Grid layouts (`grid-cols-3` or `grid-cols-12`) adapt correctly to the reduced width.

### Risk 3: Modal Migration Order
*   **Requirement:** Migrate `DatabaseManager` (Simple) FIRST.
*   **Requirement:** Migrate `PresetManager` (Complex) LAST.
*   **Verify:** Ensure `PresetManager`'s internal split-pane logic does not conflict with `<ResponsiveModal>`'s wrapper logic.

## Success Criteria

1.  **Zero Layout Bugs:** No content obscured by navigation bars.
2.  **Unified Breakpoints:** All modals behave consistently.
3.  **Clean Code:** No more manual height calculations in pages.
4.  **Scalable:** Adding a new page takes < 10 minutes using `<PageLayout>`.
