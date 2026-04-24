# Bot Manager Flow

## Overview

The "Bot Manager" interface (found in `SettingsModal.tsx`) allows users to add new bots via token and remove existing ones.

## Adding a Bot

1.  **User Input:** User pastes a token into the input field.
2.  **Frontend Action:** Calls `handleSaveBot` -> `axios.post('/api/bots', { token, set_active: true })`.
3.  **Backend Validation (`server.ts`):**
    *   Checks token format (regex/length check).
    *   Rejects known placeholder tokens.
4.  **Auto-Discovery:**
    *   The backend immediately makes a call to `getMe` using the new token.
    *   If successful, it extracts the `first_name` and `username`.
    *   It constructs a display name: `FirstName (@username)`.
5.  **Storage:**
    *   If the token exists, it updates the name.
    *   If new, it pushes `{ name, token }` to `saved_bots`.
    *   Sets `active_token` if requested.
    *   Saves to `config.json`.

## Removing a Bot

1.  **User Action:** User clicks the trash icon in the list.
2.  **Frontend Action:** Calls `handleDeleteBot` -> `axios.delete('/api/bots/:token')`.
3.  **Backend Processing:**
    *   Filters the token out of `saved_bots`.
    *   If the deleted bot was active, clears `active_token`.
    *   Saves `config.json`.

## State Updates

The `SettingsModal` locally re-fetches the bot list via `fetchBots()` (which calls `/api/config`) immediately after any add/delete operation to reflect changes in the UI.
