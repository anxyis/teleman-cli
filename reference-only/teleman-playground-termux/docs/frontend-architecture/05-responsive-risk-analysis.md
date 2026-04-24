# Responsive Risk Analysis

## 1. Breakpoint Inconsistencies

### Risk Level: Medium

**Finding:** The application uses a mix of `sm:` (640px) and `md:` (768px) to define the "Desktop" modal state.
*   **Impact:** A user on a device between 640px and 768px (e.g., Large Phone Landscape, Small Tablet) will see:
    *   **DatabaseManager:** As a small centered modal (Desktop).
    *   **PresetManager:** As a full-screen sheet (Mobile).
    *   **QueueManager:** As a full-screen sheet (Mobile).
*   **Recommendation:** Standardize on a single breakpoint (e.g., `sm:` for all modals) to ensure consistent UX across the app.

## 2. Navigation Contract Failure (Modern Mode)

### Risk Level: High

**Finding:** The `ModernLayout` forces a fixed bottom navigation bar on all screen sizes, including large desktops (`lg:`+).
*   **Impact:**
    *   **Visual Clutter:** A mobile-style bottom nav on a 27" monitor is redundant and unprofessional.
    *   **UX Blockage:** The `AutoSyncer` page removes bottom padding (`lg:pb-0`) on desktop, causing the bottom navigation bar to physically obscure the bottom ~80px of the content area. Action buttons or the last few items in a list will be unclickable.
*   **Recommendation:** Add `md:hidden` to `ModernBottomNav` and ensure a desktop alternative (e.g., Sidebar or Top Nav) is visible.

## 3. Hybrid State Complexity

### Risk Level: Low

**Finding:** The `AutoSyncer` page switches layout at `lg:` (1024px), while `PresetManager` switches at `md:` (768px).
*   **Impact:**
    *   **Tablet Portrait (768px):** The main page is a single column stack (Mobile), but clicking "Presets" opens a complex split-pane modal (Desktop).
    *   **Assessment:** While inconsistent, this is a valid adaptive strategy. The modal uses available width effectively, even if the main page remains simple.

## 4. Scroll Management (Missing Locking)

### Risk Level: Medium

**Finding:** Modals do not lock the body scroll.
*   **Impact:**
    *   **Mobile:** Scrolling a long list in a modal can accidentally scroll the background page once the end is reached (scroll chaining).
    *   **Desktop:** Less critical but can feel unpolished.
*   **Recommendation:** Implement a `useScrollLock` hook or `<ModalBase>` component to handle `document.body.style.overflow = 'hidden'`.

## 5. Scalability & Maintenance

### Risk Level: High

**Finding:** Responsive logic (breakpoints, padding, layout switching) is hardcoded into every individual page and component.
*   **Impact:**
    *   **New Features:** Adding a new page requires copying/pasting layout logic (padding, height calc).
    *   **Refactoring:** Changing a breakpoint (e.g., moving from `lg` to `xl`) requires editing 10+ files.
    *   **Tech Debt:** Inconsistent implementations (e.g., `BatchSender` vs `AutoSyncer`) degrade code quality over time.
*   **Recommendation:** Centralize layout logic into reusable components (`<PageLayout>`, `<ResponsiveModal>`, `<NavigationController>`).
