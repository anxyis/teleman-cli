# Bot Storage Architecture

## Overview

The bot storage system uses a flat-file JSON database (`config.json`) managed by the backend `configManager.ts`. This file serves as the single source of truth for all bot configurations and application settings.

## Storage Location

*   **File Path:** `data/config.json` (relative to the server root).
*   **Access:** Synchronous read/write via `fs.readFileSync` and `fs.writeFileSync`.
*   **Manager:** `src/backend/configManager.ts` exports `readConfig()` and `saveConfig()`.

## Data Structure

The `config.json` file contains a root object with the following bot-related fields:

```json
{
  "active_token": "123456789:ABC...", // The currently selected bot token
  "saved_bots": [
    {
      "name": "My Helper Bot",
      "token": "123456789:ABC..."
    },
    {
      "name": "Test Bot",
      "token": "987654321:XYZ..."
    }
  ],
  "telegram_api_url": "http://192.168.0.7:8181" // Optional local API endpoint
}
```

### Bot Object Fields

Currently, the `saved_bots` array stores minimal information:

| Field | Type | Description |
| :--- | :--- | :--- |
| `name` | `string` | Display name (fetched from `getMe` or user-provided). |
| `token` | `string` | The full Telegram Bot Token (Sensitive). |

## Security & Persistence

*   **Tokens:** Stored in plain text within `config.json`. This file is located in the `data/` directory, which should be secured at the filesystem level.
*   **Persistence:** Changes are written immediately to disk. The `update-tg` command explicitly backs up this file before updates to prevent data loss.
