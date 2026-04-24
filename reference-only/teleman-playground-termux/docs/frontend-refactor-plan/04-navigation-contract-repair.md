# Navigation Contract Repair: Modernizing Desktop

## 1. Problem Statement

*   **Contract Violation:** `ModernLayout` forces a fixed bottom navigation bar on all devices, but `AutoSyncer` removes the padding meant to accommodate it on desktop.
*   **Result:** Desktop users experience a broken layout where content is hidden behind a redundant navigation bar.
*   **Legacy Burden:** The `LegacyLayout` (Top Nav) works correctly but duplicates logic and complicates maintenance. We want to remove it.

## 2. Solution: Responsive Navigation Contract

We will implement a unified **`AppLayout`** that renders the correct navigation component based on the screen size (`lg:` breakpoint).

### Core Logic
1.  **Mobile/Tablet (< 1024px):**
    *   **Component:** `<ModernBottomNav />`
    *   **Position:** Fixed Bottom (`z-50`).
    *   **Padding:** Pages must ensure `pb-24` (handled by `<PageLayout>`).
2.  **Desktop (≥ 1024px):**
    *   **Component:** `<ModernSidebar />` (New Component)
    *   **Position:** Fixed Left Sidebar (`w-64`).
    *   **Padding:** Pages shift content right (`pl-64`).

## 3. Implementation Plan

### A. Remove Legacy System
1.  **Delete:** `src/layouts/LegacyLayout.tsx`
2.  **Delete:** `src/components/LegacyNavbar.tsx`
3.  **Refactor:** `App.tsx` to use only `ModernLayout` (renamed to `AppLayout`).

### B. Create `<ModernSidebar>`
A clean, vertical navigation component for desktop.

```tsx
export function ModernSidebar() {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-surface border-r border-border hidden lg:flex flex-col z-40">

      {/* Brand */}
      <div className="h-16 flex items-center px-6 border-b border-border">
        <Logo /> TeleMan
      </div>

      {/* Nav Links */}
      <nav className="flex-1 p-4 space-y-2">
        <NavItem to="/" icon={<LayoutDashboard />}>Playground</NavItem>
        <NavItem to="/batch" icon={<Folders />}>Batch Sender</NavItem>
        <NavItem to="/autosyncer" icon={<Settings />}>Auto-Syncer</NavItem>
      </nav>

      {/* Footer / Bot Selector */}
      <div className="p-4 border-t border-border">
        <BotSelector />
      </div>

    </aside>
  );
}
```

### C. Update `<AppLayout>` (formerly ModernLayout)

```tsx
export function AppLayout({ children }: Props) {
  return (
    <div className="bg-canvas text-text-main min-h-screen">

      {/* Desktop Sidebar */}
      <ModernSidebar />

      {/* Main Content Wrapper */}
      <div className="lg:pl-64 transition-all">
        {children}
      </div>

      {/* Mobile Bottom Nav */}
      <div className="lg:hidden">
        <ModernBottomNav />
      </div>

    </div>
  );
}
```

## 4. Migration Strategy

1.  **Phase 1:** Create `ModernSidebar`.
2.  **Phase 2:** Modify `ModernLayout` to conditionally render Sidebar (lg+) or BottomNav (< lg).
3.  **Phase 3:** Update `AutoSyncer` and `Playground` to remove custom padding hacks (relying on `<PageLayout>` or global layout classes).
4.  **Phase 4:** Delete Legacy components.

## 5. Risk Assessment

*   **Bot Selector:** Currently in the header. Needs to move to the Sidebar on desktop.
*   **Header Redundancy:** On mobile, `ModernHeader` is used. On desktop, the Sidebar replaces the need for a top header for navigation, but page titles might still be needed. `<PageLayout>` handles this via slots.
