# Extension Points: Bot Avatars

## Integration Strategy

To add support for bot profile avatars, we need to extend the data fetching and storage logic during the bot addition phase.

### 1. Data Fetching (`server.ts`)

In the `POST /api/bots` handler, where `getMe` is currently called:

*   **Current:** Fetches `result.first_name` and `result.username`.
*   **Proposed:** After a successful `getMe`, assume valid token and call `getUserProfilePhotos`.
    *   **Method:** `getUserProfilePhotos` (limit: 1).
    *   **Response:** Extract `file_id` of the first photo (largest size).
    *   **Retrieval:** Call `getFile` to get the path, then construct the download URL `https://api.telegram.org/file/bot<token>/<file_path>`.
    *   **Caching:** Download the image to `data/avatars/<bot_id>.jpg` to avoid token exposure in frontend URLs and reduce API calls.

### 2. Storage (`config.json`)

Extend the bot object in `saved_bots`:

```json
{
  "name": "Bot Name",
  "token": "...",
  "avatar_url": "/api/avatars/12345.jpg" // Local path served by backend
}
```

### 3. Frontend Display

*   **Header:** Update `BotSelector` (Mobile & Desktop) to display the avatar image instead of the generic `<Bot />` icon if available.
*   **Bot Manager:** Update `SettingsModal` list to show avatars.

## Security Considerations

*   **Token Exposure:** Do **not** use the raw Telegram file URL in the frontend (`https://api.telegram.org/file/bot<TOKEN>/...`) as this exposes the token. Always proxy or cache the image.
*   **File Validation:** Ensure downloaded files are valid images before saving to disk.

## Architectural Constraints

*   **Synchronous Config:** `config.json` is read synchronously. storing base64 strings is **discouraged** due to performance. Store file paths.
*   **Static Serving:** Need to ensure the `data/avatars` directory is exposed via a static route (e.g., `/api/avatars`) or `express.static`.
