# Modal & Manager Patterns

## 1. Core Modal Architecture

The application utilizes a **Dual-Mode** modal system, relying on CSS breakpoints to switch between two distinct interaction models.

### A. The Mobile Full-Screen Sheet (`< sm:`)
*   **Behavior:** A fixed, full-width, full-height overlay (`fixed inset-0 w-full h-full`) that covers the entire screen, including navigation.
*   **Visuals:** `bg-surface`. No backdrop visible. Header is flush with the top of the viewport.
*   **Scrolling:** Content scrolls internally (`overflow-y-auto`).
*   **Navigation:** Uses an internal "Back" or "Close" button in the header.

### B. The Desktop Centered Modal (`≥ sm:` or `≥ md:`)
*   **Behavior:** A centered, floating dialog box (`max-w-4xl`, `max-h-[85vh]`).
*   **Visuals:** `bg-surface` with `rounded-xl` borders and `shadow-2xl`. A semi-transparent backdrop (`bg-black/80`) dims the page content.
*   **Scrolling:** Content scrolls internally (`overflow-y-auto`).
*   **Dismissal:** Clicking the backdrop or a dedicated "X" button closes the modal.

---

## 2. Modal Breakdown

### 2.1 PresetManager (`src/components/PresetManager.tsx`)
**Complexity: High**
*   **Dual-Pane Layout (Desktop):** Implements a Master-Detail view (`w-1/3` List + `flex-1` Editor) on screens larger than `768px` (`md:`).
*   **Stack Navigation (Mobile):** Uses conditional rendering (`hidden md:flex`) to show only one pane at a time based on selection state.
*   **State Sharing:** A single `editingId` state variable drives both the visibility of the mobile panes and the content of the desktop right pane.

### 2.2 DatabaseManager & TargetsManager
**Complexity: Medium**
*   **Pattern:** Standard Sheet-to-Modal transition at `640px` (`sm:`).
*   **Layout:** Single column content.
*   **Header:** Adjusts padding (`p-4` vs `sm:p-6`) and title size (`text-lg` vs `sm:text-xl`).

### 2.3 QueueManager (`src/components/QueueManager.tsx`)
**Complexity: Low**
*   **Pattern:** Standard Sheet-to-Modal transition, but at `768px` (`md:`).
*   **Inconsistency:** Uses `md:` while others use `sm:`.

---

## 3. Structural Analysis

### Shared Components
**None.** Every modal manually implements the wrapper logic (`fixed inset-0`, backdrop, container styling). There is no `<ModalBase>` component.
*   **Risk:** Inconsistent z-indexes (`z-50` vs `z-[60]`), padding, and backdrop opacity.
*   **Maintenance:** Changing the backdrop color or blur requires editing 5+ files.

### Scroll Locking
**Missing.** The application does **not** implement body scroll locking (`document.body.style.overflow = 'hidden'`) when a modal is open.
*   **Impact (Mobile):** Scrolling to the end of a modal's content can cause the background page to scroll (scroll chaining/bleeding).
*   **Impact (Desktop):** Less noticeable due to the scrollbar being on the modal container, but still present.

### Padding Assumptions
*   **Mobile:** Modals assume they are full-screen and do not account for bottom navigation safe areas beyond standard `pb-safe` (if used).
*   **Desktop:** Modals are centered and avoid navigation interference.
