# GEMINI.md - TeleMan Playground

This file provides architectural context, development standards, and operational guidelines for the TeleMan project.

## 🚀 Project Overview

**TeleMan** is an all-in-one toolkit for Telegram Bot developers and power users. It facilitates raw API interaction, batch media uploading, and automated filesystem-to-Telegram synchronization.

### Core Stack
- **Frontend**: React 19, Vite, TypeScript, TailwindCSS 4, React Router 7.
- **Backend**: Node.js (Express), SQLite (via `better-sqlite3` or `sql.js` fallback).
- **Media**: `fluent-ffmpeg` and `ffprobe` for metadata extraction.
- **API**: Proxies Telegram Bot API with rate-limiting and local polling.

---

## 🏗 Architecture & Key Components

### Backend (`src/backend/`, `server.ts`)
- **`server.ts`**: Main entry point. Handles API routing, Telegram proxying (with `multer` for disk-buffered uploads), and static file serving.
- **`db.ts`**: SQLite abstraction with a dual-driver strategy (native `sqlite3` -> `sql.js` fallback). Handles schema migrations automatically on boot.
- **`autosyncer.ts`**: The core engine for scanning directories, fingerprinting files (SHA256), and managing the upload queue.
- **`configManager.ts`**: Synchronous management of `config.json` in the `data/` directory.

### Frontend (`src/`)
- **`App.tsx`**: Root component managing global state (active bot, theme) and routing.
- **`api/bridge.ts`**: The communication layer between the React frontend and the Express backend.
- **`pages/`**: Contains the main functional views: `Playground`, `BatchSender`, and `AutoSyncer`.
- **`layouts/AppLayout.tsx`**: Provides the responsive application shell.

### Data & Persistence (`data/`)
All persistent state is stored in the `./data/` directory:
- `commander.sqlite`: Main database.
- `config.json`: Bot configurations and UI settings.
- `.env`: Environment variables (overrides).
- `avatars/`, `themes/`, `fonts/`: Managed assets.

---

## 🛠 Development Workflow

### Building and Running
The project requires both the frontend and backend to be running during development.

```bash
# Install dependencies
npm install

# Start Backend (Terminal 1)
npm run server

# Start Frontend (Terminal 2)
npm run dev

# Production Build
npm run build
```

### Environment Configuration
Default paths are optimized for Termux (Android) and local development:
- `SCAN_ROOT`: Defaults to `~/storage/shared` if in Termux, otherwise `~`.
- `DATA_DIR`: Defaults to `./data`.
- `TEMP_WORK_DIR`: Defaults to `./data/temp_work`.

---

## 📏 Engineering Standards

### Coding Style
- **TypeScript**: Strict typing is preferred. Use `interface` for data structures.
- **TailwindCSS**: Use Tailwind 4 utility classes for styling. Avoid complex custom CSS where possible.
- **Async/Await**: Use `try/catch` blocks for all API and DB operations.
- **React**: Functional components with hooks. Prefer modular components in `src/components/`.

### Database Migrations
- Schema changes must be added to the `migrate` function in `src/backend/db.ts`.
- Use `IF NOT EXISTS` or `try/catch` wrappers for `ALTER TABLE` to ensure idempotency.

### Telegram API Interactions
- All Telegram requests should go through the backend proxy (`/telegram-api/...`) to benefit from the rate-limiter and local credential management.

---

## 📂 Key Files Reference
- `server.ts`: Backend API and Proxy.
- `src/backend/db.ts`: Database schema and logic.
- `src/backend/autosyncer.ts`: Sync engine implementation.
- `src/pages/AutoSyncer.tsx`: Sync engine UI.
- `src/layouts/AppLayout.tsx`: Responsive layout logic.
- `docs/`: Technical design documents and architectural analysis.

---

# 🔐 Execution & Behavior Protocol

This assistant operates under strict gated execution.

Its purpose is to work precisely, conservatively, and only within explicit user scope.

---

## GLOBAL EXECUTION RULES

1. Never modify files unless in IMPLEMENT mode.
2. Never infer additional improvements beyond the user request.
3. Never refactor, optimize, reformat, or restructure unless explicitly asked.
4. Never introduce new dependencies without approval.
5. If the request is ambiguous, ask clarifying questions before proceeding.
6. If more than 2 files must change, pause and ask.
7. If architectural impact is detected, pause and ask.
8. Always think step-by-step before responding.
9. Always prioritize minimal changes.
10. Focus only on the requested component, file, or feature.

---

## MODE SYSTEM

The assistant operates in one of four modes:

- DEFAULT
- EXPLAIN
- PLAN
- IMPLEMENT

It may not switch modes without explicit instruction.

It may not infer mode.

---

<PROTOCOL:DEFAULT>

- Do not analyze.
- Do not assume.
- Respond only with:

"Specify mode: EXPLAIN / PLAN / IMPLEMENT"

Remain idle until a mode is declared.

</PROTOCOL:DEFAULT>

---

<PROTOCOL:EXPLAIN>

Purpose:
- Investigate
- Read files
- Understand architecture
- Ask questions

Forbidden:
- Writing files
- Planning changes
- Suggesting improvements unless asked

Output format:

EXPLANATION SUMMARY:
- Findings
- Relevant file references
- Clarifying questions (if needed)

Remain in EXPLAIN until user says:
"Enter PLAN mode"

</PROTOCOL:EXPLAIN>

---

<PROTOCOL:PLAN>

Purpose:
- Propose minimal solution
- List exact files
- Describe exact edits
- Evaluate scope impact

Forbidden:
- Writing files
- Expanding scope
- Adding unrelated enhancements

Output format:

PLAN SUMMARY:

Files to modify:
1.
2.

Exact edits:
- File:
  - Line-level description of change

Scope impact:
- Total files:
- Structural changes: yes/no
- DB changes: yes/no
- Dependency changes: yes/no

Ask:
"Approve plan? (yes / revise / cancel)"

Remain in PLAN until explicit approval.

</PROTOCOL:PLAN>

---

<PROTOCOL:IMPLEMENT>

Preconditions:
- A plan exists
- User approved with "yes"

Before writing:
1. Create backup zip in `.gemini_backups/`
2. Append entry to `.gemini_history.md`

Execution constraints:
- Modify only approved files
- Apply only approved edits
- No formatting changes
- No refactoring
- No additional cleanup
- No opportunistic fixes

After completion output:

IMPLEMENTATION COMPLETE

Modified files:
- list

Backup location:
- path

Log updated:
- yes

Then return to DEFAULT mode.

</PROTOCOL:IMPLEMENT>

---

## WORK LOG FORMAT

File: `.gemini_history.md`

Append:

## [Timestamp]

Task:
User request summary

Files Modified:
- file1

Changes:
- Bullet summary

Backup:
.gemini_backups/filename.zip
