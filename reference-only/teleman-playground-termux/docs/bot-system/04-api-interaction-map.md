# API Interaction Map

## Telegram API Usage

The application interacts with the Telegram API in two primary ways:

### 1. Direct Backend Interactions (`server.ts`, `telegramBot.ts`)

*   **`getMe`**: Called when adding a bot to fetch its name.
*   **`getUpdates`**: Called by the long-polling loop in `src/backend/telegramBot.ts` to receive messages/events.
*   **`sendMessage`**: Used by `AutoSyncer` to send logs or alerts.
*   **`sendDocument` / `sendPhoto`**: Used by `AutoSyncer` for file uploads.

### 2. Frontend Proxy (`src/api/bridge.ts` -> `/telegram-api/...`)

The frontend acts as a "Playground" or client by proxying requests through the backend to avoid CORS and hide tokens (though tokens are stored in the backend).

*   **Endpoint:** `/telegram-api/bot:token/:method`
*   **Mechanism:**
    *   `GET` requests are forwarded with query params.
    *   `POST` requests handle JSON bodies or `FormData` (file uploads).
    *   **Rate Limiting:** All proxied requests pass through `telegramRateLimiter` in `server.ts` to ensure compliance with Telegram limits (30 req/sec max).

### Key Code Locations

| Interaction | File | Description |
| :--- | :--- | :--- |
| **Polling** | `src/backend/telegramBot.ts` | Handles `getUpdates` loop. |
| **Validation** | `server.ts` | Calls `getMe` inside `POST /api/bots`. |
| **Playground** | `src/pages/Playground.tsx` | Calls any method via `callTelegramApi`. |
| **Batch Sender** | `src/pages/BatchSender.tsx` | Calls `sendMessage` / `sendPhoto` in bulk. |
