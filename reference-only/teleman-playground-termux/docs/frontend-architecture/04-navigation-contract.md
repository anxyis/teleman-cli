# Navigation System Contract

## 1. Overview

The application employs two distinct navigation systems, **Legacy** and **Modern**, toggled by the user in settings. Each system has a different responsive contract and implications for padding and layout.

---

## 2. Legacy Layout (`src/layouts/LegacyLayout.tsx`)

**Contract:**
*   **Mobile (< 768px):** Bottom Navigation (`fixed bottom-0`).
    *   **Visibility:** `md:hidden` (Only on Mobile).
    *   **Padding Compensation:** `pb-20 md:pb-0` applied to `div.min-h-screen`.
*   **Desktop (≥ 768px):** Top Navigation (`sticky top-0`).
    *   **Visibility:** `hidden md:flex`.
    *   **Padding Compensation:** None needed (Top Nav pushes content down naturally).

**Verdict:** **Robust.** The layout contract correctly handles switching between top and bottom navigation, ensuring content is never obscured.

---

## 3. Modern Layout (`src/layouts/ModernLayout.tsx`)

**Contract:**
*   **Mobile (< 768px):** Bottom Navigation (`fixed bottom-0`).
    *   **Visibility:** Always Visible (`fixed bottom-0`).
    *   **Padding Compensation:** `pb-24` applied to `div.min-h-screen`.
*   **Desktop (≥ 768px):** Bottom Navigation (`fixed bottom-0`).
    *   **Visibility:** Always Visible (`fixed bottom-0`).
    *   **Padding Compensation:** `pb-24` applied globally?
        *   **Conflict:** The `AutoSyncer` page explicitly *removes* bottom padding on desktop (`lg:pb-0`).
        *   **Result:** The Bottom Navigation Bar will **obscure** the bottom ~80px of the `AutoSyncer` content on desktop screens when in Modern Mode.

**Verdict:** **Broken Contract.** The system forces mobile-first bottom navigation onto desktop screens without proper responsive hiding or padding compensation in page layouts.

---

## 4. Overlay Risks

### A. Bottom Navigation Overlap (Modern Mode)
*   **Risk:** High.
*   **Cause:** `ModernBottomNav` lacks `md:hidden`, and `AutoSyncer` removes `pb-24` at `lg:`.
*   **Impact:** The bottom of the file list or action buttons in `AutoSyncer` will be unclickable on desktop.

### B. Modal Footer Clipping
*   **Risk:** Medium.
*   **Cause:** Mobile Modals (e.g., `PresetManager` on Mobile) are `h-full` and use `pb-32` internally to clear the "Save" button. If the bottom nav is visible (in Modern Mode, it might be below the modal due to z-index), the `pb-32` might be insufficient or excessive depending on the device safe area.
*   **Mitigation:** `PresetManager` uses `z-[60]`, which places it *above* the bottom nav (`z-50`). However, the modal footer is `absolute bottom-0`. On iPhone X+, the home indicator area might overlap the "Save" button if `pb-safe` is not used.
