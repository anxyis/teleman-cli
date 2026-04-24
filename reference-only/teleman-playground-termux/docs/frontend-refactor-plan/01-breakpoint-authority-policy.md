# Breakpoint Authority Policy

## 1. Objective
To eliminate the "tablet gap" and inconsistent modal behaviors (some switching at `sm`, some at `md`, layout at `lg`) by defining a strict, unified responsive contract.

## 2. Official Breakpoint Definitions

We will standardize on the following Tailwind breakpoints for all structural decisions.

| Range | Breakpoint | Description | Layout Mode | Modal Mode |
| :--- | :--- | :--- | :--- | :--- |
| **Mobile** | `< 768px` | **Small Phones** to **Large Phones** | Document Scroll (Vertical Stack) | Full-Screen Sheet |
| **Tablet** | `≥ 768px` (`md:`) | **iPad Mini** to **iPad Pro Portrait** | Document Scroll (Vertical Stack) | Centered Modal |
| **Desktop** | `≥ 1024px` (`lg:`) | **iPad Pro Landscape** to **Desktops** | Dashboard Grid (Container Scroll) | Centered Modal |

---

## 3. Policy Rules

### A. The "Modal Switch" Rule (`md:`)
All modals and managers **MUST** switch from "Full-Screen Sheet" to "Centered Dialog" at **`md:` (768px)**.
*   **Current State:** `DatabaseManager` switches at `sm:`, `PresetManager` at `md:`.
*   **New Policy:** `sm:` is deprecated for structural changes. It should only be used for minor internal grid adjustments (e.g., card columns).

### B. The "Layout Switch" Rule (`lg:`)
All pages **MUST** switch from "Document Scroll" to "Dashboard Grid" at **`lg:` (1024px)**.
*   **Reasoning:** Tablet portrait mode (768px) is often too narrow for a 3-column dashboard but wide enough for a centered modal. Keeping the document scroll on tablets ensures better readability and touch target sizing.

### C. The "Navigation Switch" Rule (`lg:`)
*   **Mobile/Tablet (< 1024px):** Bottom Navigation Bar.
*   **Desktop (≥ 1024px):** Side Navigation Sidebar (or Top Nav).
*   **Reasoning:** Bottom navigation on a desktop monitor is poor UX. We will move to a **Sidebar** on desktop to utilize horizontal space effectively.

---

## 4. Implementation Guide

When refactoring components, apply these classes:

*   **Modal Containers:** `fixed inset-0 z-50 md:flex md:items-center md:justify-center`
*   **Modal Content:** `w-full h-full md:h-auto md:max-h-[85vh] md:max-w-4xl md:rounded-2xl`
*   **Page Layouts:** `flex flex-col min-h-screen lg:grid lg:grid-cols-12 lg:h-screen lg:overflow-hidden`

## 5. Migration Impact

| Component | Current Authority | Action Required |
| :--- | :--- | :--- |
| `DatabaseManager` | `sm:` (640px) | Bump to `md:` (768px) |
| `TargetsManager` | `sm:` (640px) | Bump to `md:` (768px) |
| `GroupEditorModal` | `sm:` (640px) | Bump to `md:` (768px) |
| `QueueManager` | `md:` (768px) | Keep as is |
| `PresetManager` | `md:` (768px) | Keep as is |
