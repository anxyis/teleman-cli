# Responsive Breakpoints & Layout Logic

## 1. Tailwind Configuration

The project utilizes the default Tailwind CSS v3+ breakpoint system. No custom screens or container queries are defined in `tailwind.config.js`.

| Breakpoint | Minimum Width | Use Case in Project |
| :--- | :--- | :--- |
| **`sm:`** | `640px` | **Primary Modal Switch:** Triggers the transition from full-screen mobile sheets to centered dialog modals for `DatabaseManager`, `TargetsManager`, and `GroupEditorModal`. |
| **`md:`** | `768px` | **Secondary Layout Switch:** Used by `PresetManager` to enable the master-detail split view. Also controls the visibility of the legacy mobile navigation bar (`md:hidden`). |
| **`lg:`** | `1024px` | **Desktop Dashboard Switch:** The main application pages (`AutoSyncer`, `Playground`) switch from a vertical document scroll to a fixed-height, multi-column dashboard grid at this point. |
| **`xl:`** | `1280px` | *Rarely used.* |
| **`2xl:`** | `1536px` | *Unused.* |

---

## 2. Component Breakpoint Mapping

Different components use different "authority" breakpoints to determine their desktop state, leading to potential inconsistency on tablet devices (640px - 1024px).

| Component | Breakpoint | Behavior Change |
| :--- | :--- | :--- |
| **`DatabaseManager`** | `sm:` (640px) | Full-screen Sheet → Centered Modal |
| **`TargetsManager`** | `sm:` (640px) | Full-screen Sheet → Centered Modal |
| **`GroupEditorModal`** | `sm:` (640px) | Full-screen Sheet → Centered Modal |
| **`PresetManager`** | `md:` (768px) | Stack Navigation → Split View (List + Editor) |
| **`QueueManager`** | `md:` (768px) | Full-screen Sheet → Centered Modal |
| **`LegacyLayout`** | `md:` (768px) | Bottom Nav Hidden (`md:hidden`), Top Nav Visible |
| **`AutoSyncer` (Page)** | `lg:` (1024px) | Vertical Stack → 3-Column Grid |
| **`Playground` (Page)** | `lg:` (1024px) | Vertical Stack → 12-Column Grid |
| **`FolderCard`** | `sm:` (640px) | Grid layout for internal details (`grid-cols-1` → `sm:grid-cols-2`) |

---

## 3. Inconsistencies & Hybrid States

### The "Tablet Zone" (640px - 1024px)
A user on an iPad Portrait (768px) will experience a mixed state:
*   **Modals:** Will be Desktop-style (centered boxes) or Split-View (`PresetManager`).
*   **Page Layout:** Will be **Mobile-style** (vertical stack).
*   **Navigation:** Will be **Desktop-style** (Top Nav in Legacy Mode).

### Conflicting Authorities
*   **`sm:` vs `md:` for Modals:** `DatabaseManager` becomes a modal at `640px`, but `QueueManager` waits until `768px`. This means on a large phone (e.g., iPhone Pro Max landscape), one might look like a modal and the other like a full-screen sheet.
*   **`md:` vs `lg:` for Layout:** The navigation switches to desktop mode at `768px`, but the content doesn't optimize for desktop until `1024px`. This results in a "stretched" mobile layout on tablets.

## 4. Files Containing Responsive Logic

The following files contain explicit Tailwind responsive classes (e.g., `md:flex`, `lg:grid-cols-3`):

*   `src/layouts/LegacyLayout.tsx`
*   `src/layouts/ModernLayout.tsx`
*   `src/pages/AutoSyncer.tsx`
*   `src/pages/Playground.tsx`
*   `src/pages/BatchSender.tsx`
*   `src/components/PresetManager.tsx`
*   `src/components/DatabaseManager.tsx`
*   `src/components/TargetsManager.tsx`
*   `src/components/GroupEditorModal.tsx`
*   `src/components/QueueManager.tsx`
*   `src/components/FolderCard.tsx`
*   `src/components/SyncGroupEditor.tsx`
