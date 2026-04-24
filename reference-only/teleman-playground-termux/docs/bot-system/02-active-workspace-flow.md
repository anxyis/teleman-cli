# Active Workspace Flow

## Overview

The "Active Workspace" represents the currently selected Telegram bot. This selection drives the behavior of the `AutoSyncer`, `Playground`, and `BatchSender` by determining which token is used for API calls.

## Internal Mechanics

1.  **State Source:** The `active_token` field in `config.json`.
2.  **Backend State:** `configManager.getActiveToken()` provides the current token to backend services (like `telegramBot.ts` polling).
3.  **Frontend State:** The `bridge.ts` `getConfig()` method fetches the `activeToken` on mount and after changes.

## Switching Logic

When a user selects a bot from the `BotSelector` dropdown (or "Switch Workspace" on mobile):

1.  **Frontend:** Calls `api.saveBot("", token, true)` (via `src/api/bridge.ts`).
2.  **API Request:** `POST /api/bots`
    *   Payload: `{ token: "...", set_active: true }`
3.  **Backend Processing (`server.ts`):**
    *   Finds the bot in `saved_bots`.
    *   Updates `config.active_token` to the new token.
    *   Calls `saveConfig()`.
4.  **Polling Update:** The backend `telegramBot` service is **not** automatically restarted in the current implementation merely by changing the config file variable, but `server.ts` has logic (if `startBot()` was called) or if `telegramBot` reads config dynamically.
    *   *Correction based on code review:* `server.ts` initializes polling once on boot. Switching the active token might require a restart or explicit re-init logic (currently handled by the frontend triggering a refresh or the backend referencing `getActiveToken()` during operations).

## Syncing Frontend & Backend

*   **Poll/Fetch:** The frontend `App.tsx` calls `fetchConfig()` on mount.
*   **Reactive Update:** When `BotSelector` triggers a switch, it calls the `onBotChange` callback, which re-runs `fetchConfig()` in `App.tsx`, updating the global `activeToken` state passed down to all components.
