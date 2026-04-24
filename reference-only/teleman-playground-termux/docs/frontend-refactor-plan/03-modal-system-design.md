# Modal System Design: `<ResponsiveModal>`

## 1. Problem Statement

Current modals (`PresetManager`, `DatabaseManager`, etc.) use inconsistent implementations of:
*   **Wrapper Logic:** (`fixed inset-0`, `w-full h-full`, `z-50`)
*   **Breakpoints:** (`sm:` vs `md:`)
*   **Backdrop:** (Some have it, some don't, varying opacities)
*   **Scroll Locking:** (Completely absent, leading to scroll bleeding)

## 2. Solution: Unified `<ResponsiveModal>` Component

We will introduce a **`<ResponsiveModal>`** component that handles all responsive behavior, animation, and accessibility requirements.

### Core Features
1.  **Mobile Full-Screen Sheet (`< md`):**
    *   Fills the entire screen.
    *   No backdrop.
    *   Internal scroll container.
    *   Safe area padding for bottom actions.
2.  **Desktop Centered Dialog (`≥ md`):**
    *   Centered with max width/height.
    *   Backdrop with click-to-close.
    *   Rounded corners and shadow.
3.  **Automatic Scroll Locking:** Uses a hook to disable body scroll when open.
4.  **Z-Index Management:** Uses a portal or fixed high z-index (`z-[100]`) to ensure it overlays everything.

## 3. Mandatory Requirements (Non-Negotiable)

### A. Scrollbar Compensation (Desktop)
When opening a modal on desktop (which usually has a scrollbar):
*   **Measure:** Calculate the width of the user's scrollbar.
*   **Compensate:** Apply `padding-right` to `body` equal to the scrollbar width.
*   **Prevent Shift:** Ensure the layout does not "jump" horizontally when `overflow: hidden` is applied.

### B. Accessibility (ARIA)
The component **MUST** implement the following attributes:
*   `role="dialog"`
*   `aria-modal="true"`
*   `aria-labelledby="{id}-title"`
*   **Focus Trap:** Focus must be contained within the modal while open.
*   **Focus Restoration:** Focus must return to the trigger element when closed.

### C. iOS Body Overscroll
*   **Prevent Overscroll:** Implement touch event listeners or CSS `overscroll-behavior: contain` to prevent "pull-to-refresh" gestures on the body while the modal is open.

## 4. Proposed API

```tsx
interface ResponsiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;

  /**
   * Actions rendered in the footer/header depending on layout.
   * e.g., Save, Cancel buttons.
   */
  actions?: React.ReactNode;

  children: React.ReactNode;

  /**
   * Custom width classes for desktop.
   * default: "max-w-2xl"
   */
  widthClass?: string;
}
```

## 5. Implementation Details

### Scroll Lock Hook

```tsx
function useScrollLock(isOpen: boolean) {
  useEffect(() => {
    if (isOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      document.body.style.overflow = 'hidden';
      // Add touch-action: none for iOS? Or rely on overscroll-behavior
      document.body.style.overscrollBehavior = 'contain';
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      document.body.style.overscrollBehavior = '';
    }
    return () => {
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
        document.body.style.overscrollBehavior = '';
    };
  }, [isOpen]);
}
```

### Component Structure (Simplified)

```tsx
export function ResponsiveModal({ isOpen, onClose, title, children }: ResponsiveModalProps) {
  useScrollLock(isOpen);
  if (!isOpen) return null;

  return (
    <div
        className="fixed inset-0 z-[100] flex items-center justify-center"
        role="dialog"
        aria-modal="true"
    >

      {/* Backdrop (Desktop Only) */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm hidden md:block animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="
        relative w-full h-full md:h-auto md:max-h-[85vh] md:max-w-2xl
        bg-surface md:rounded-2xl shadow-2xl overflow-hidden flex flex-col
        animate-in zoom-in-95 slide-in-from-bottom-2 duration-200
        focus:outline-none
      " tabIndex={-1}>

        {/* Header */}
        <div className="p-4 border-b border-border flex justify-between items-center shrink-0">
          <h2 className="text-lg font-bold" id="modal-title">{title}</h2>
          <button onClick={onClose} aria-label="Close modal"><X /></button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 overscroll-contain">
          {children}
        </div>

        {/* Mobile Safe Area Spacer */}
        <div className="h-safe md:hidden" />
      </div>
    </div>
  );
}
```

## 6. Migration Strategy

1.  **Refactor `DatabaseManager`**: Replace manual wrapper with `<ResponsiveModal>`.
2.  **Refactor `TargetsManager`**: Replace manual wrapper.
3.  **Refactor `PresetManager`**:
    *   Use `<ResponsiveModal>` for the outer shell.
    *   Maintain internal split-pane logic for desktop content.
    *   Remove custom layout classes (`fixed inset-0`, etc.).

## 7. Risk Assessment

*   **Z-Index Conflicts:** Ensure `z-[100]` is higher than `ModernBottomNav` (`z-50`) and any sticky headers.
*   **Nested Modals:** Currently rare, but `<ResponsiveModal>` should handle stacking correctly or warn if nested.
