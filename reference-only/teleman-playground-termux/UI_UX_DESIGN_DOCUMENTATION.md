# TeleMan Application - UI/UX Design Documentation

**Version:** 2.0  
**Last Updated:** February 26, 2026  
**Document Purpose:** Complete frontend redesign reference for senior frontend architects

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Full Feature Breakdown](#2-full-feature-breakdown)
3. [API Documentation](#3-api-documentation)
4. [Current UI Description](#4-current-ui-description)
5. [Roles & Permissions Matrix](#5-roles--permissions-matrix)
6. [State Logic & Business Rules](#6-state-logic--business-rules)
7. [Data Models](#7-data-models)
8. [Error & Edge Case Handling](#8-error--edge-case-handling)
9. [Constraints the UI Must Respect](#9-constraints-the-ui-must-respect)
10. [Future Roadmap](#10-future-roadmap)

---

## 1. High-Level Overview

### 1.1 Core Purpose

TeleMan is an all-in-one toolkit for Telegram Bot developers and power users. It provides three primary capabilities:

1. **API Playground** - A developer-centric interface to interact with the raw Telegram Bot API without writing code
2. **Batch Sender** - A production-grade mass media uploader for distributing large collections of files to Telegram users, groups, and forum topics
3. **Auto-Syncer** - An advanced filesystem synchronization engine for archiving local storage to Telegram channels with intelligent deduplication, metadata extraction, and scheduling

### 1.2 Target Users

| User Type | Description | Primary Features Used |
|-----------|-------------|----------------------|
| **Telegram Bot Developers** | Developers building bots who need to test API calls quickly | API Playground |
| **Content Distributors** | Users managing channels who need to send bulk media | Batch Sender |
| **Archive Managers** | Users backing up local file collections to Telegram | Auto-Syncer |
| **Power Users** | Advanced users managing multiple bots and complex sync workflows | All features |

### 1.3 Main Workflows

#### Workflow 1: API Playground Usage
```
User selects/enters method → Configures JSON parameters → Sends request → Views response → (Optional) Scans for resources → Saves to profile
```

#### Workflow 2: Batch File Sending
```
User selects target (user/chat/topic) → Selects files/folder → Configures options (caption, spoiler, delay) → Starts batch → Monitors progress → Completion
```

#### Workflow 3: Auto-Syncer Configuration
```
User creates preset (filter rules) → Creates sync folder/group → Configures source path, target, schedule → Runs sync → Monitors job → Reviews results
```

### 1.4 Use Cases

| Use Case | Description | Feature |
|----------|-------------|---------|
| Test Telegram API method | Developer wants to test `sendMessage` with custom parameters | Playground |
| Send album to channel | User wants to send 50 photos with captions to a channel | Batch Sender |
| Backup music collection | User wants to sync music folder with metadata extraction | Auto-Syncer |
| Manage multiple bots | User switches between different bot contexts | Bot Selector |
| Schedule daily backup | User configures automatic daily sync of a folder | Auto-Syncer Scheduler |

---

## 2. Full Feature Breakdown

### 2.1 API Playground

#### Description
A raw Telegram Bot API interaction tool with method library, JSON parameter editor, and response analyzer.

#### Inputs
- **Method Name**: String (e.g., `sendMessage`, `getMe`, `sendPhoto`)
- **JSON Parameters**: Valid JSON object
- **File Attachments**: Optional (for methods like `sendPhoto`, `sendDocument`)
- **Bot Token**: Selected from saved bots or configured in settings

#### Outputs
- **API Response**: JSON response from Telegram API
- **Extracted Resources**: Users, chats, topics detected from response
- **Local History**: Last 10 methods used (stored in localStorage)

#### States
| State | Description | UI Indicator |
|-------|-------------|--------------|
| Idle | Ready for input | Empty response area with placeholder |
| Loading | Request in progress | Spinner on Send button |
| Success | API returned `ok: true` | Green checkmark, response displayed |
| Error | API returned `ok: false` or network error | Red alert icon, error message |

#### Edge Cases
- Invalid JSON in parameters → Show "Invalid JSON" error
- No bot token configured → Alert user to add token in Settings
- Network timeout → Display timeout error message
- 429 Rate Limit → Queue request (handled by backend rate limiter)

#### Dependencies
- Backend proxy (`/telegram-api/bot:token/:method`)
- Bot token configuration
- Rate limiter service

---

### 2.2 Batch Sender

#### Description
Mass file uploader with intelligent media processing, large file splitting, and serial queue processing.

#### Inputs
- **Target Selection**: User, Chat, or Forum Topic (from saved resources)
- **Files**: Multiple file selection via file input or folder selection
- **Caption**: Optional text caption for all files
- **Settings**:
  - `sendAsDocument`: Boolean - Send as file vs compressed media
  - `hasSpoiler`: Boolean - Apply spoiler effect
  - `smartCaption`: Boolean - Auto-generate caption from metadata
  - `useTimestampCaption`: Boolean - Append file timestamp
  - `delayMs`: Number (100-5000) - Delay between sends

#### Outputs
- **Upload Progress**: Per-file and overall progress percentage
- **Logs**: Real-time success/failure messages
- **Completion Summary**: Total sent/failed count

#### States
| State | Description | UI Indicator |
|-------|-------------|--------------|
| Idle | Ready to select files | File input visible |
| Files Selected | Files loaded, ready to send | File count displayed |
| Uploading | Batch in progress | Progress bar, cancel button |
| Cancelled | User stopped batch | "Cancelled" message |
| Completed | All files processed | Summary statistics |

#### Edge Cases
- **Large Files (>2GB)**: Automatically split into parts (`.part001`, `.part002`, etc.)
- **Audio Files**: Extract ID3 metadata (title, artist, cover art) for native `sendAudio`
- **Video Files**: Extract duration, dimensions for `sendVideo` with streaming support
- **Network Interruption**: AbortController-based cancellation
- **Rate Limiting**: Configurable delay between sends

#### Dependencies
- Telegram Bot API (`sendPhoto`, `sendVideo`, `sendAudio`, `sendDocument`)
- `music-metadata-browser` for client-side metadata extraction
- Backend rate limiter

---

### 2.3 Auto-Syncer

#### Description
Filesystem synchronization engine with presets, scheduling, deduplication, and rich metadata extraction.

#### Core Components

##### 2.3.1 Presets
Filter rules that define what files to sync and how to process them.

**Inputs:**
- `name`: String - Preset identifier
- `extensions`: String[] - Included file extensions
- `exclude`: String[] - Excluded extensions/paths
- `minSize`: Number (bytes) - Minimum file size
- `maxSize`: Number (bytes) - Maximum file size
- `regex`: String - Filename regex pattern
- `smartSplit`: Boolean - Enable video re-encoding for large files
- `smartSplitStrategy`: 're-encode' | 'copy'
- `archiveMode`: 'none' | 'zip_folder' | 'zip_indiv'
- `archiveSize`: Number (MB) - ZIP chunk size
- `archivePassword`: String (optional)

##### 2.3.2 Sync Folders
Individual sync configurations linking a source path to a Telegram target.

**Inputs:**
- `name`: String - Display name
- `sourcePath`: String - Local filesystem path
- `targetChatId`: String - Telegram chat/channel ID
- `targetTopicId`: String (optional) - Forum topic thread ID
- `presetId`: String - Reference to preset
- `scheduleType`: 'none' | 'daily' | 'weekly' | 'monthly' | 'custom'
- `scheduleConfig`: Object - Schedule configuration

##### 2.3.3 Sync Groups
Collections of sync folders that can be run together.

**Inputs:**
- `name`: String - Group name
- `tasks`: Array of folder configurations with:
  - `source_path`: String
  - `target_chat_id`: String
  - `target_topic_id`: String (optional)
  - `preset_id`: String
  - `order_index`: Number
  - `enabled`: Boolean
  - `custom_name`: String (optional)

#### Outputs
- **Job Queue**: List of pending sync jobs
- **Active Job**: Current sync progress with:
  - `currentFile`: String
  - `progress`: Number (0-100)
  - `speed`: String (e.g., "12.5 MB/s")
  - `eta`: String (e.g., "5m 20s")
  - `processedSize`: String
  - `totalSize`: String
- **Sync Sessions**: Historical records with:
  - `files_scanned`, `files_uploaded`, `files_skipped`, `files_failed`
  - `bytes_uploaded`: Number
  - `errors`: Array of {file, error}
  - `status`: 'success' | 'partial' | 'failed'

#### States
| State | Description | UI Indicator |
|-------|-------------|--------------|
| Idle | Ready to sync | "Run Now" button enabled |
| Scanning | Crawling filesystem | Progress indicator |
| Processing | Uploading files | Active job card with stats |
| Queued | Waiting for other jobs | Queue manager badge |
| Completed | Sync finished | Summary in session history |
| Failed | Errors occurred | Error count, "View Errors" button |
| Changes Pending | Folder modified since last sync | Amber warning icon |
| Up to Date | No changes detected | Green checkmark |

#### Edge Cases
- **Duplicate Files**: SHA-256 fingerprinting prevents re-upload
- **Missing Files**: Skip and log error, continue with remaining files
- **Telegram Limits**: Split files >2GB, respect rate limits
- **Clock Regression**: Scheduler detects and handles time changes
- **Folder Deletion**: Handle missing source paths gracefully

#### Dependencies
- SQLite database (`commander.sqlite`)
- FFmpeg for metadata extraction and thumbnail generation
- 7-Zip for archive creation
- Backend scheduler service

---

### 2.4 Bot Management

#### Description
Multi-bot workspace management with avatar display, token storage, and quick switching.

#### Inputs
- `name`: String - Bot display name (auto-fetched from Telegram)
- `token`: String - Bot token (format: `digits:characters`)
- `set_active`: Boolean - Whether to switch to this bot

#### Outputs
- **Saved Bots List**: Array of bot configurations with avatars
- **Active Token**: Currently selected bot token
- **Resources**: Users, chats, topics per bot

#### States
| State | Description | UI Indicator |
|-------|-------------|--------------|
| No Bots | First-time setup | Welcome screen with token input |
| Bot Selected | Active bot configured | Avatar and name in header |
| Switching | Changing active bot | Loading spinner |
| Refreshing | Updating bot metadata | Refresh indicator |

#### Edge Cases
- Invalid token format → Show validation error
- Token already exists → Skip network calls, instant switch
- Avatar fetch failure → Use fallback bot icon
- Network timeout → Use cached bot name

---

### 2.5 Resource Management

#### Description
Storage and management of Telegram users, chats, and topics discovered during API usage.

#### Data Structure
```json
{
  "users": [
    { "id": 1246237259, "first_name": "John", "last_name": "Doe", "username": "johnd", "is_bot": false }
  ],
  "chats": [
    { "id": -1002763531537, "title": "My Group", "type": "supergroup" }
  ],
  "topics": [
    { "chat_id": -1002763531537, "thread_id": 9, "name": "General" }
  ]
}
```

#### Operations
- **Scan**: Extract resources from API response JSON
- **Save**: Persist to `resources.json` per bot token
- **Merge**: Combine new resources with existing (deduplicate by ID)
- **Delete**: Remove individual resources

---

## 3. API Documentation

### 3.1 Authentication

All API calls use the bot token embedded in the URL path or stored in the session. No additional authentication headers are required for the local backend.

### 3.2 Base URLs

| Environment | Frontend | Backend | Telegram API |
|-------------|----------|---------|--------------|
| Development | `http://localhost:5173` | `http://localhost:3000` | Configurable (default: `http://192.168.0.7:8181`) |
| Production | Served by backend | `http://localhost:3000` | Configurable |

### 3.3 Configuration Endpoints

#### GET `/api/config`
Retrieve application configuration.

**Response:**
```json
{
  "active_token": "8301864733:AAHNu8TZ5XjGDXMww95xPNwOTCufh8O3Bag",
  "saved_bots": [
    {
      "name": "scoobytelly",
      "token": "8301864733:AAHNu8TZ5XjGDXMww95xPNwOTCufh8O3Bag",
      "avatar_filename": "8301864733.jpg"
    }
  ],
  "base_url": null,
  "telegram_api_url": "http://192.168.0.7:8181",
  "font_preview": {
    "text": "ABCDEFGHIJKLM\nNOPQRSTUVWXYZ\n0123456789",
    "use_font_sheet": false,
    "bg_color": "#ffffff",
    "text_color": "#000000",
    "size": "medium",
    "enabled": true
  }
}
```

#### POST `/api/bots`
Add or activate a bot.

**Request:**
```json
{
  "name": "My Bot",
  "token": "123456789:ABC-DEF1234567890ghijklmnop",
  "set_active": true
}
```

**Response:** Same as GET `/api/config`

**Errors:**
- `400 Bad Request` - Invalid token format
- `400 Bad Request` - Telegram API error (invalid token)

#### POST `/api/bots/:token/refresh`
Refresh bot metadata and avatar.

**Response:**
```json
{
  "success": true,
  "bot": {
    "name": "Bot Name (@username)",
    "token": "...",
    "avatar_filename": "bot_id.jpg"
  }
}
```

#### DELETE `/api/bots/:token`
Remove a saved bot.

**Response:** Same as GET `/api/config`

---

### 3.4 Resource Endpoints

#### GET `/api/resources/:token`
Get saved resources for a bot token.

**Response:**
```json
{
  "users": [
    { "id": 1246237259, "first_name": "John", "username": "johnd", "is_bot": false }
  ],
  "chats": [
    { "id": -1002763531537, "title": "My Group", "type": "supergroup" }
  ],
  "topics": [
    { "chat_id": -1002763531537, "thread_id": 9, "name": "General" }
  ]
}
```

#### POST `/api/resources/:token`
Save/merge resources.

**Request:** Same structure as GET response

**Response:**
```json
{
  "success": true,
  "counts": {
    "users": 5,
    "chats": 3,
    "topics": 7
  }
}
```

---

### 3.5 Telegram Proxy Endpoints

#### GET `/telegram-api/bot:token/:method`
Forward GET requests to Telegram API.

**Example:** `GET /telegram-api/bot123456:ABC/getMe`

**Query Parameters:** Any Telegram API parameters

**Response:** Direct passthrough from Telegram API

#### POST `/telegram-api/bot:token/:method`
Forward POST requests with optional file uploads.

**Headers:** `Content-Type: multipart/form-data` (for files) or `application/json`

**Request Body:** Form data or JSON matching Telegram API spec

**Response:** Direct passthrough from Telegram API

**Example - Send Photo:**
```
POST /telegram-api/bot123456:ABC/sendPhoto
Content-Type: multipart/form-data

chat_id: -1002763531537
photo: [binary file]
caption: "Hello World"
```

---

### 3.6 Auto-Syncer Endpoints

#### GET `/api/folders`
List all sync folders.

**Response:**
```json
[
  {
    "id": "uuid-here",
    "name": "Music Backup",
    "source_path": "/storage/music",
    "target_chat_id": "-1002804701274",
    "target_topic_id": null,
    "preset_id": "preset-uuid",
    "preset_name": "Audio Files",
    "enabled": true,
    "status": "idle",
    "last_sync": 1708934400000,
    "created_at": 1708848000000,
    "schedule_type": "daily",
    "schedule_config": "{\"version\":1,\"timezone\":\"UTC\"}",
    "next_sync_due": 1709020800000,
    "last_session_status": "success",
    "snapshot_fingerprint": "abc123..."
  }
]
```

#### POST `/api/folders`
Create a new sync folder.

**Request:**
```json
{
  "name": "Documents",
  "sourcePath": "/storage/docs",
  "targetChatId": "-1002804701274",
  "presetId": "preset-uuid",
  "targetTopicId": "9",
  "scheduleType": "weekly",
  "scheduleConfig": {
    "version": 1,
    "timezone": "America/New_York",
    "days_of_week": [1, 3, 5]
  }
}
```

**Response:**
```json
{ "id": "new-uuid" }
```

#### PUT `/api/folders/:id`
Update sync folder configuration.

**Request:** Same as POST (all fields optional)

**Response:**
```json
{ "success": true }
```

**Errors:**
- `409 Conflict` - Duplicate folder name

#### DELETE `/api/folders/:id`
Delete a sync folder.

**Response:**
```json
{ "success": true }
```

#### POST `/api/folders/:id/run`
Trigger immediate sync.

**Response:**
```json
{ "success": true, "message": "Sync started" }
```

**Errors:**
- `400 Bad Request` - NO_BOT_TOKEN

#### GET `/api/folders/:id/freshness`
Check if folder has changes since last sync.

**Response:**
```json
{
  "status": "changes_pending",
  "changed": true,
  "details": {
    "currentFingerprint": "new-hash",
    "storedFingerprint": "old-hash",
    "fileCount": 150,
    "capped": false
  }
}
```

**Status Values:**
- `up_to_date` - No changes
- `changes_pending` - Files modified/added
- `unknown` - No previous sync

#### GET `/api/folders/:id/sessions`
Get sync session history.

**Response:**
```json
[
  {
    "id": "session-uuid",
    "folder_id": "folder-uuid",
    "started_at": 1708934400000,
    "ended_at": 1708938000000,
    "status": "success",
    "files_scanned": 200,
    "files_uploaded": 150,
    "files_skipped": 45,
    "files_failed": 5,
    "bytes_uploaded": 1073741824,
    "errors": [
      { "file": "/path/to/file.mp4", "error": "Timeout" }
    ]
  }
]
```

---

### 3.7 Preset Endpoints

#### GET `/api/presets`
List all presets.

**Response:**
```json
[
  {
    "id": "preset-uuid",
    "name": "Video Files",
    "extensions_include": ["mkv", "mp4", "avi"],
    "extensions_exclude": ["tmp"],
    "min_size_mb": 0,
    "max_size_mb": 2048,
    "archive_mode": "none",
    "archive_size_mb": 2048,
    "smart_split_video": true,
    "smart_split_strategy": "re-encode",
    "filename_regex": null,
    "created_at": 1708848000000
  }
]
```

#### POST `/api/presets`
Create a preset.

**Request:**
```json
{
  "name": "Large Videos",
  "rules": {
    "extensions": ["mkv", "mp4"],
    "exclude": ["temp"],
    "minSize": 524288000,
    "maxSize": 2147483648,
    "regex": null,
    "smartSplit": true,
    "smartSplitStrategy": "re-encode",
    "archiveMode": "none",
    "archiveSize": 2147483648,
    "archivePassword": null
  }
}
```

**Response:**
```json
{ "id": "new-preset-uuid" }
```

#### PUT `/api/presets/:id`
Update a preset.

**Request:** Same structure as POST

**Response:**
```json
{ "success": true }
```

#### DELETE `/api/presets/:id`
Delete a preset.

**Response:**
```json
{ "success": true }
```

**Errors:**
- `409 Conflict` - Preset is in use by active folders

---

### 3.8 Sync Group Endpoints

#### GET `/api/groups`
List all sync groups with tasks.

**Response:**
```json
[
  {
    "id": "group-uuid",
    "name": "Weekly Backup",
    "schedule_cron": null,
    "schedule_type": "weekly",
    "schedule_config": "{\"days_of_week\":[1]}",
    "status": "idle",
    "last_run": 1708848000000,
    "tasks": [
      {
        "id": "task-uuid",
        "source_path": "/storage/photos",
        "target_chat_id": "-1002804701274",
        "target_topic_id": null,
        "preset_id": "preset-uuid",
        "order_index": 0,
        "enabled": true,
        "custom_name": "Photos"
      }
    ]
  }
]
```

#### POST `/api/groups`
Create a sync group.

**Request:**
```json
{
  "name": "Daily Sync",
  "cron": null,
  "tasks": [
    {
      "sourcePath": "/path/one",
      "targetChatId": "-1001234567890",
      "presetId": "preset-uuid",
      "enabled": true
    }
  ]
}
```

**Response:**
```json
{ "id": "new-group-uuid" }
```

#### PUT `/api/groups/:id`
Update a sync group.

**Request:** Same as POST with all fields

**Response:**
```json
{ "success": true }
```

#### DELETE `/api/groups/:id`
Delete a sync group.

**Response:**
```json
{ "success": true }
```

#### POST `/api/groups/:id/run`
Trigger group sync.

**Response:**
```json
{ "success": true, "message": "Group Sync started" }
```

---

### 3.9 Job & Queue Endpoints

#### GET `/api/job/current`
Get currently active job.

**Response:**
```json
{
  "jobId": "job-uuid",
  "name": "Music Backup",
  "status": "processing",
  "currentFile": "/music/album/track.mp3",
  "totalFilesDiscovered": 100,
  "filesSent": 45,
  "filesFailed": 2,
  "filesSkipped": 3,
  "totalBytesSent": 524288000,
  "speed": "12.5 MB/s",
  "eta": "5m 20s"
}
```

**Status Values:** `scanning`, `processing`, `completed`, `failed`, `idle`

#### POST `/api/job/skip`
Skip current file in active job.

**Response:**
```json
{ "success": true }
```

#### POST `/api/job/cancel`
Cancel active job.

**Request:**
```json
{ "deleteSent": true }
```

**Response:**
```json
{ "success": true }
```

#### GET `/api/queue`
Get job queue.

**Response:**
```json
[
  {
    "id": "queue-item-uuid",
    "name": "Documents Sync",
    "addedAt": 1708934400000,
    "status": "queued"
  }
]
```

#### DELETE `/api/queue/:id`
Remove job from queue.

**Response:**
```json
{ "success": true }
```

#### POST `/api/queue/reorder`
Reorder queue.

**Request:**
```json
{ "ids": ["uuid-1", "uuid-2", "uuid-3"] }
```

**Response:**
```json
{ "success": true }
```

#### POST `/api/queue/clear`
Clear all queued jobs.

**Response:**
```json
{ "success": true }
```

---

### 3.10 Database Endpoints

#### GET `/api/db/registry`
List file registry entries.

**Response:**
```json
[
  {
    "file_hash": "sha256-hash",
    "folder_id": "folder-uuid",
    "file_path": "/path/to/file.mp4",
    "size_bytes": 104857600,
    "synced_at": 1708934400000,
    "folder_name": "Music Backup",
    "message_id": "12345",
    "chat_id": "-1002804701274",
    "file_id": "telegram-file-id",
    "job_id": "job-uuid"
  }
]
```

#### DELETE `/api/db/registry/:hash`
Delete registry entry.

**Response:**
```json
{ "success": true }
```

#### DELETE `/api/db/registry`
Clear all registry entries.

**Response:**
```json
{ "success": true }
```

#### GET `/api/db/history`
List job history.

**Response:**
```json
[
  {
    "id": "job-uuid",
    "name": "Music Backup",
    "status": "completed",
    "stats_json": "{\"sent\":100,\"failed\":2,\"bytes\":1073741824}",
    "created_at": 1708934400000
  }
]
```

#### DELETE `/api/db/history`
Clear job history.

**Response:**
```json
{ "success": true }
```

---

### 3.11 System Endpoints

#### GET `/api/stats`
Get system statistics.

**Response:**
```json
{
  "cpu": 45,
  "ram": 62,
  "disk": {
    "free": 53687091200,
    "total": 107374182400,
    "usagePercent": 50
  }
}
```

#### GET `/api/registry/stats`
Get registry statistics.

**Response:**
```json
{
  "totalFilesSeen": 5000,
  "totalFilesSynced": 4500,
  "dedupSavingsBytes": 1073741824
}
```

#### GET `/api/bot/polling`
Get bot polling status.

**Response:**
```json
{ "paused": false }
```

#### POST `/api/bot/polling`
Control bot polling.

**Request:**
```json
{ "paused": true }
```

**Response:**
```json
{ "status": "paused" }
```

---

### 3.12 Utility Endpoints

#### POST `/api/scan`
Scan filesystem (legacy endpoint).

**Request:**
```json
{ "path": "/optional/subpath" }
```

**Response:**
```json
["/path/to/file1.mp4", "/path/to/file2.mkv"]
```

#### POST `/api/fs/ls`
List directories for folder picker.

**Request:**
```json
{ "path": "relative/path" }
```

**Response:**
```json
{
  "current": "/absolute/path",
  "folders": ["folder1", "folder2", "folder3"]
}
```

#### GET `/api/backup`
Download system backup.

**Response:** ZIP file download containing:
- `config.json`
- `resources.json`
- `commander.sqlite`

#### POST `/api/restore`
Restore from backup.

**Request:** `multipart/form-data` with `backup` file field

**Response:**
```json
{ "success": true, "message": "Restoration successful" }
```

#### GET `/api/debug/report`
Download debug report.

**Response:** Plain text log file

#### GET `/api/debug/logs`
Get recent logs.

**Query:** `?limit=100`

**Response:**
```json
[
  {
    "timestamp": "2026-02-26T10:30:00.000Z",
    "level": "info",
    "category": "AutoSyncer",
    "message": "Sync started",
    "metadata": { "folder": "Music" }
  }
]
```

---

### 3.13 Settings Endpoints

#### POST `/api/config/font`
Save font preview settings.

**Request:**
```json
{
  "text": "Sample Text",
  "use_font_sheet": false,
  "bg_color": "#ffffff",
  "text_color": "#000000",
  "size": "medium",
  "enabled": true
}
```

**Response:**
```json
{ "success": true }
```

#### POST `/api/config/network`
Save network settings.

**Request:**
```json
{ "telegram_api_url": "http://192.168.0.7:8181" }
```

**Response:**
```json
{ "success": true }
```

#### POST `/api/config/font/bg`
Upload custom font preview background.

**Request:** `multipart/form-data` with `background` file field

**Response:**
```json
{ "success": true }
```

---

## 4. Current UI Description

### 4.1 Application Layout

#### 4.1.1 Desktop Layout (≥1024px)
```
┌─────────────────────────────────────────────────────────────┐
│ Sidebar (256px)          │ Main Content Area                │
│ ┌─────────────────────┐  │ ┌──────────────────────────────┐ │
│ │ TeleMan Logo        │  │ │ Page Header (optional)       │ │
│ ├─────────────────────┤  │ ├──────────────────────────────┤ │
│ │ Navigation Links    │  │ │                              │ │
│ │ - Playground        │  │ │   Page Content               │ │
│ │ - Batch Sender      │  │ │   (scrollable)               │ │
│ │ - Auto-Syncer       │  │ │                              │ │
│ │ - Settings          │  │ │                              │ │
│ ├─────────────────────┤  │ │                              │ │
│ │ Bot Selector        │  │ │                              │ │
│ └─────────────────────┘  │ └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### 4.1.2 Mobile Layout (<1024px)
```
┌─────────────────────────────────────┐
│ Header (64px)                       │
│ ┌─────────────────────────────────┐ │
│ │ Logo | Bot Selector | Settings  │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│                                     │
│   Page Content (scrollable)         │
│                                     │
│                                     │
├─────────────────────────────────────┤
│ Bottom Navigation (80px)            │
│ ┌──────┐ ┌──────┐ ┌──────┐         │
│ │ Home │ │Batch │ │ Sync │         │
│ └──────┘ └──────┘ └──────┘         │
└─────────────────────────────────────┘
```

### 4.2 Theme System

#### Color Tokens (CSS Variables)
```css
[data-theme="modern"] {
  --color-canvas: #000000;
  --color-surface: #121212;
  --color-surface-highlight: #1E1E1E;
  --color-border: #2D2D2D;
  --color-primary: #BB86FC;
  --color-primary-hover: #D0BCFF;
  --color-on-primary: #000000;
  --color-text-main: #FFFFFF;
  --color-text-muted: #B0B0B0;
}

[data-theme="legacy"] {
  --color-canvas: #020617;
  --color-surface: #0f172a;
  --color-surface-highlight: #1e293b;
  --color-border: #334155;
  --color-primary: #2563eb;
  --color-primary-hover: #3b82f6;
  --color-on-primary: #ffffff;
  --color-text-main: #f1f5f9;
  --color-text-muted: #94a3b8;
}
```

#### Font Families
- **Gilroy** (default for Modern theme) - Loaded from CDN
- **JetBrains Mono** - For code/technical display

### 4.3 Pages

#### 4.3.1 Welcome Screen
**Route:** `/` (when no bots configured)

**Components:**
- Bot icon (48px, blue background)
- Title: "Welcome to TeleMan"
- Description text
- Token input field
- "Get Started" button
- Link to @BotFather

**State:**
- Empty → Show input
- Loading → Spinner on button
- Error → Red error banner
- Success → Navigate to Playground

---

#### 4.3.2 Playground Page
**Route:** `/`

**Layout:** Two-column grid (5:7 ratio on desktop)

**Left Panel:**
1. **Command Library** (Collapsible categories)
   - Essentials: `getMe`, `getUpdates`
   - Forum Topics: `createForumTopic`, `deleteForumTopic`, etc.
   - Chat Management: `setChatTitle`, `getChatAdministrators`, etc.
   - Moderation: `banChatMember`, `deleteMessage`, etc.

2. **Input Section**
   - Method input (with Terminal icon)
   - JSON Parameters textarea (with Prettify button)
   - Send Request button

**Right Panel:**
1. **Response Output**
   - Status indicator (OK/Failed)
   - Analysis Dashboard (collapsible)
   - Raw JSON viewer (syntax highlighted)

2. **History Chips**
   - Recent methods (clickable to restore)

**Interactions:**
- Click library item → Populate method and params
- Prettify button → Format JSON
- Send → POST to proxy, show loading, display response
- Scan for Resources → Parse response, show extracted entities
- Save to Profile → Persist resources to backend

---

#### 4.3.3 Batch Sender Page
**Route:** `/batch`

**Components:**

1. **Target Selector**
   - Dropdown with optgroups:
     - Users
     - Chats/Groups
     - Topics (grouped by parent chat)
   - Refresh button

2. **Caption Input**
   - Textarea for caption
   - "Append timestamp" checkbox

3. **Settings Panel**
   - Input Mode toggle: Files | Folder
   - Send as File toggle (compression)
   - Spoiler Effect toggle
   - Smart Caption toggle
   - Delay slider (100ms - 5000ms)

4. **File Selection**
   - File input (multiple)
   - Folder input (webkitdirectory)

5. **Progress Section** (during upload)
   - Progress bar (0-100%)
   - Cancel button
   - Log output (scrolling)

**States:**
- Idle: Show inputs
- Uploading: Show progress, disable inputs
- Complete: Show summary, reset button

---

#### 4.3.4 Auto-Syncer Page
**Route:** `/autosyncer`

**Header Components:**
1. **Vital Signs** (scrollable pills)
   - CPU usage
   - RAM usage
   - Disk usage (with warning states)

2. **Action Buttons** (scrollable chips)
   - Presets
   - Database
   - Targets
   - Queue (with badge)
   - Logs (toggleable)
   - New Sync (FAB or button)

**Content Sections:**

1. **Active Job Card** (when running)
   - Status icon (processing/uploading)
   - Current file path
   - Progress bar with shimmer
   - Stats grid: Speed, ETA, Data sent
   - Skip/Cancel controls

2. **Search & Toolbar**
   - Search input
   - Sort toggle: Name | Recent
   - New Group button

3. **Sync Groups List**
   - Group cards (expandable)
   - Each card shows:
     - Name, folder count
     - Schedule info
     - Status indicator
     - Last run time
   - Expanded view:
     - Folder list preview
     - Run Group button
     - Edit/Delete buttons

4. **Single Folders List**
   - Folder cards showing:
     - Name, source path
     - Preset name
     - Target chat
     - Last sync time
     - Status badge (syncing, up-to-date, changes pending, error)
   - Actions: Run, Edit, Delete

**Modals:**
- Add/Edit Folder Modal
- Group Editor Modal
- Preset Manager
- Database Manager
- Targets Manager
- Queue Manager
- Sync Error Modal

---

#### 4.3.5 Logs Page
**Route:** `/autosyncer/logs`

**Layout:** Full-screen terminal view

**Components:**
- Header with back button, entry count, download button
- Log entries (auto-refresh every 3s)
  - Timestamp
  - Level badge (color-coded)
  - Category
  - Message
  - Metadata (collapsible)

**Levels:**
- `info` - Green
- `warn` - Yellow
- `error` - Red
- `debug` - Gray

---

### 4.4 Components

#### 4.4.1 BotSelector
**Location:** Sidebar (desktop), Header (mobile)

**Desktop Behavior:**
- Click → Portal dropdown (positioned below trigger)
- Dropdown shows:
  - "Switch Workspace" header
  - Bot list with avatars
  - "Manage Bots" footer button

**Mobile Behavior:**
- Click → ResponsiveModal
- Modal shows:
  - Bot list
  - "Manage Bots" action button

**Bot Item:**
- Avatar (40x40 desktop, 32x32 mobile)
- Name (truncated)
- Token preview (first 8 chars)
- Checkmark for active bot
- Loading spinner when switching

---

#### 4.4.2 ResponsiveModal
**Purpose:** Consistent modal across devices

**Desktop:**
- Centered overlay with backdrop
- Max height 85vh
- Rounded corners (2xl)
- Fixed header with close button
- Scrollable content
- Footer for actions

**Mobile:**
- Full-screen overlay
- No backdrop
- Slide-in animation
- Safe area padding

**Props:**
- `isOpen`: Boolean
- `onClose`: Callback
- `title`: String
- `actions`: ReactNode (footer buttons)
- `widthClass`: String (Tailwind class)

---

#### 4.4.3 PageLayout
**Purpose:** Consistent page structure

**Slots:**
- `sidebar`: Desktop-only left panel
- `header`: Mobile-only top bar content
- `children`: Main content
- `disableScroll`: Boolean (for custom scroll handling)

---

#### 4.4.4 FolderCard
**Display:**
- Folder icon + name
- Source path (truncated, monospace)
- Status badge (clickable for errors)
- Metadata grid: Preset, Target, Last Sync
- Action buttons: Run, Edit, Delete

**Status Colors:**
- `syncing`: Blue, pulsing
- `up_to_date`: Emerald
- `changes_pending`: Amber
- `error`: Red
- `partial`: Orange
- `unknown`: Gray

---

#### 4.4.5 GroupCard
**Display:**
- Folder icon + group name
- Task count, schedule info
- Status indicator
- Expandable details:
  - Folder list preview
  - Last run time
  - Run/Edit/Delete buttons

---

#### 4.4.6 ActiveJobCard
**Display:**
- Background glow effect
- Status icon (spinning if processing)
- Current file path
- Progress bar with shimmer
- Stats grid (Speed, ETA, Data)
- Skip/Cancel controls

**Cancel Flow:**
1. Click X → Show confirmation
2. Options: "Stop Only" | "Stop & Undo"
3. Undo deletes sent messages from Telegram

---

#### 4.4.7 PresetManager
**Layout:** Two-pane (list + editor)

**Left Pane:**
- "New Preset" button
- Preset list with type indicators:
  - Archive (blue)
  - Smart Split (purple)
  - Standard (green)
- Delete button (hover)

**Right Pane (Editor):**
- General Configuration:
  - Name input
  - Min/Max size (MB)
  - Included/Excluded extensions
- Archive Mode:
  - Disabled | Combined Zip | Folder Zips
  - Split size, password
- Smart Video Split:
  - Toggle
  - Strategy: Re-encode | Copy Stream
- Regex Tester:
  - Pattern input
  - Test string input
  - Match indicator

---

#### 4.4.8 DatabaseManager
**Tabs:**
- File Registry
- Job History

**Registry View:**
- Folder filter pills
- Table: Path, Size, Synced At, Actions
- Delete row button
- Clear all button (with confirmation)

**History View:**
- Table: Job Name, Status, Files Sent, Time
- Status badges (color-coded)
- Clear all button

---

#### 4.4.9 TargetsManager
**Filters:** all | user | chat | topic

**List Items:**
- Type icon (User/Chat/Topic)
- Name/Title
- ID (monospace)
- Bot name badge
- Delete button

---

#### 4.4.10 QueueManager
**Sections:**
- Running Now (active job)
- Queued (drag-and-drop list)

**Queue Item:**
- Drag handle
- Name, queued time
- Remove button

**Actions:**
- Reorder (drag-and-drop)
- Remove individual
- Clear all

---

#### 4.4.11 TopicSelector
**Display:**
- Label + Refresh button
- Dropdown with optgroups:
  - Users
  - Chats/Groups
  - Topics (grouped by parent chat)
- Helper text showing selected IDs

---

#### 4.4.12 FolderPicker
**Display:**
- Path bar (current path)
- Up button
- Folder list
- Select/Cancel buttons

**Navigation:**
- Click folder → Navigate into
- Up button → Parent directory
- Select → Return path to parent

---

#### 4.4.13 AnalysisDashboard
**Trigger:** "Scan for Resources" button in Playground

**Display:**
- Save to Profile button
- Three cards:
  - Users (with BOT badge)
  - Chats (with type badge)
  - Topics (with thread/chat IDs)

---

#### 4.4.14 VitalSignsHeader
**Display:** Scrollable pills
- CPU (pulsing if >80%)
- RAM (orange if >80%)
- Disk (yellow if >90%, red+pulse if >95%)

---

#### 4.4.15 SyncErrorModal
**Display:**
- Session info grid
- Summary stats (Uploaded, Skipped, Failed)
- Error list (scrollable)
- Session history chips
- Retry/Close buttons

---

### 4.5 Forms

#### 4.5.1 Add/Edit Folder Form
**Fields:**
1. Folder Name (text, required)
2. Source Path (text + browse button, required)
3. Preset (dropdown, required)
4. Target (TopicSelector, required)
5. Schedule:
   - Type: Manual | Daily | Weekly | Monthly | Custom
   - Weekly: Day chips (S M T W T F S)
   - Monthly: Day of month dropdown

**Validation:**
- All required fields must be filled
- Path must exist (validated on run)

---

#### 4.5.2 Group Editor Form
**Layout:** Two-pane (list + node editor)

**Left Pane:**
- Group name input
- Folder list (reorderable)
- Add Folder button

**Right Pane (Node Editor):**
- Source Path (text + browse)
- Preset (dropdown)
- Target (TopicSelector)
- Custom Label (optional)
- Enabled toggle

**Actions:**
- Add to Group
- Update Folder
- Save Group Config

---

#### 4.5.3 Settings Modal
**Navigation:** Root → Category → Settings

**Categories:**
1. **Appearance**
   - Interface Mode: Legacy | Modern
   - Font Family: Gilroy | JetBrains Mono (Modern only)
   - Show Logs Button toggle
   - FAB Mode toggle

2. **Font Previews**
   - Enable toggle
   - Font Sheet Mode toggle
   - Preview Text textarea
   - Background/Text color pickers
   - Preset buttons (B&W, W&B)
   - Custom background upload
   - Size: small | medium | large

3. **Bot Manager**
   - Saved bots list
   - Add new bot (token input)
   - Switch/Delete buttons

4. **Network**
   - Telegram API URL input

5. **Data & Storage**
   - Download Backup
   - Download Debug Report
   - Restore from backup

---

### 4.6 Loading States

| Component | Loading Indicator |
|-----------|-------------------|
| Buttons | Inline spinner, disabled state |
| Page Load | Centered spinner |
| Bot Switching | Spinner in avatar |
| File Upload | Progress bar (0-99% → 100%) |
| Resource Fetch | Refresh icon spin |
| Folder Freshness Check | Pulsing status badge |

---

### 4.7 Error Handling

#### Inline Errors
- Invalid JSON → "Invalid JSON parameters" message
- Missing required field → Alert on submit
- Duplicate name → 409 Conflict, alert message

#### Toast/Banner Errors
- Network failures → Alert dialog
- Telegram API errors → Response description displayed
- Permission errors → Alert with guidance

#### Error Recovery
- Retry buttons on failed syncs
- Skip file option during jobs
- Cancel with undo option

---

### 4.8 Responsive Behavior

#### Breakpoints
- Mobile: < 1024px
- Desktop: ≥ 1024px

#### Adaptive Patterns

| Element | Mobile | Desktop |
|---------|--------|---------|
| Navigation | Bottom bar | Sidebar |
| Settings | Full-screen modal | Centered modal |
| Bot Selector | Modal dropdown | Portal dropdown |
| Modals | Full-screen | Centered with backdrop |
| Tables | Horizontal scroll | Full width |
| Action Buttons | Scrollable chips | Inline |
| FAB | Enabled option | Standard button |

---

### 4.9 Current Limitations

1. **No Inline File Upload in Playground** - File attachments require manual form construction
2. **Client-Side Metadata Extraction** - Limited to browser capabilities
3. **No Real-Time Progress for Batch Sender** - Sequential processing only
4. **Limited Pagination** - Large lists may cause performance issues
5. **No Keyboard Shortcuts** - All interactions are mouse/touch
6. **No Dark/Light Auto-Switch** - Manual theme selection only
7. **Single Active Job** - Queue processes sequentially
8. **No Search in Dropdowns** - Manual scrolling for long lists

---

## 5. Roles & Permissions Matrix

TeleMan is designed as a single-user application with no multi-user authentication. However, there are functional "roles" based on bot ownership:

| Permission | Bot Owner | Viewer (N/A) |
|------------|-----------|--------------|
| Add/Edit Bots | ✅ | - |
| Send Messages | ✅ (via bot) | - |
| Configure Sync | ✅ | - |
| View Logs | ✅ | - |
| Delete Data | ✅ | - |

**Note:** The application assumes the user has full control over configured bot tokens. There is no permission separation within the UI.

---

## 6. State Logic & Business Rules

### 6.1 Validation Rules

#### Bot Token
- Format: `^\d+:[A-Za-z0-9_-]+$`
- Minimum length: 20 characters
- Must not be placeholder: `123456789:ABC-DEF1234567890`

#### Sync Folder
- Name: Non-empty, unique per user
- Source Path: Must exist on filesystem
- Target Chat ID: Must be valid Telegram ID
- Preset: Must reference existing preset

#### Preset
- Name: Non-empty
- Extensions: Comma-separated list
- Size Range: minSize ≤ maxSize
- Regex: Must be valid JavaScript regex

#### Schedule
- Daily: No additional config
- Weekly: At least one day selected
- Monthly: Day 1-28 (to handle all months)
- Custom: Valid combination of weekly + monthly

---

### 6.2 Workflow Transitions

#### Sync Job Lifecycle
```
queued → scanning → processing → completed
                      ↓
                    failed
```

#### Folder Status Transitions
```
idle → syncing → idle (success)
              ↓
            idle (failed)
```

#### Bot Polling States
```
active → paused (via Playground getUpdates)
paused → active (after getUpdates completes)
```

---

### 6.3 Status Lifecycle

#### Sync Session Status
| Status | Condition |
|--------|-----------|
| `success` | All files uploaded successfully |
| `partial` | Some files failed (< 50% failure rate) |
| `failed` | Majority failed (≥ 50% failure rate) |

#### Folder Freshness Status
| Status | Condition |
|--------|-----------|
| `up_to_date` | Fingerprint matches last sync |
| `changes_pending` | Fingerprint differs |
| `unknown` | No previous sync recorded |

---

### 6.4 Derived Fields

#### File Caption Generation
```
if smartCaption:
  if audio with metadata:
    caption = "Artist - Title"
  elif video:
    caption = "filename (WIDTHxHEIGHT - MM:SS)"
  elif image:
    caption = "filename (WIDTHxHEIGHT)"
  else:
    caption = "filename"

if useTimestampCaption:
  caption += " [file.lastModified]"

if file is split part:
  caption += " (Part N)"
```

#### Speed Calculation
```
speed = bytesUploaded / (currentTime - startTime)
formatted = formatBytes(speed) + "/s"
```

#### ETA Calculation
```
remaining = totalSize - uploaded
eta = remaining / speed
formatted = formatDuration(eta)
```

---

## 7. Data Models

### 7.1 Database Schema (SQLite)

#### presets
```sql
CREATE TABLE presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    extensions_include TEXT,      -- JSON array
    extensions_exclude TEXT,      -- JSON array
    min_size_mb INTEGER DEFAULT 0,
    max_size_mb INTEGER DEFAULT 2048,
    archive_mode TEXT DEFAULT 'none',
    archive_size_mb INTEGER DEFAULT 2048,
    archive_password TEXT,
    smart_split_video BOOLEAN DEFAULT 0,
    smart_split_strategy TEXT DEFAULT 're-encode',
    filename_regex TEXT,
    created_at INTEGER
);
```

#### sync_folders
```sql
CREATE TABLE sync_folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source_path TEXT NOT NULL,
    target_chat_id TEXT NOT NULL,
    target_topic_id TEXT,
    preset_id TEXT NOT NULL,
    enabled BOOLEAN DEFAULT 1,
    status TEXT DEFAULT 'idle',
    last_sync INTEGER,
    created_at INTEGER,
    schedule_type TEXT DEFAULT 'none',
    schedule_config TEXT DEFAULT '{}',
    schedule_version INTEGER DEFAULT 1,
    next_sync_due INTEGER,
    last_checked_at INTEGER,
    last_session_id TEXT,
    last_session_status TEXT,
    snapshot_fingerprint TEXT,
    snapshot_capped INTEGER DEFAULT 0,
    large_folder_warned INTEGER DEFAULT 0,
    FOREIGN KEY(preset_id) REFERENCES presets(id)
);
```

#### sync_groups
```sql
CREATE TABLE sync_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    schedule_cron TEXT,
    schedule_type TEXT DEFAULT 'none',
    schedule_config TEXT DEFAULT '{}',
    schedule_version INTEGER DEFAULT 1,
    next_sync_due INTEGER,
    last_checked_at INTEGER,
    preset_id TEXT,
    is_active BOOLEAN DEFAULT 1,
    last_run INTEGER,
    status TEXT DEFAULT 'idle',
    FOREIGN KEY(preset_id) REFERENCES presets(id)
);
```

#### sync_tasks
```sql
CREATE TABLE sync_tasks (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    source_path TEXT NOT NULL,
    target_chat_id TEXT NOT NULL,
    target_topic_id TEXT,
    preset_id TEXT,
    custom_name TEXT,
    order_index INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT 1,
    FOREIGN KEY(group_id) REFERENCES sync_groups(id)
);
```

#### registry
```sql
CREATE TABLE registry (
    file_hash TEXT,
    folder_id TEXT,
    file_path TEXT NOT NULL,
    size_bytes INTEGER,
    synced_at INTEGER,
    created_at INTEGER,
    status TEXT,
    folder_name TEXT,
    message_id TEXT,
    chat_id TEXT,
    file_id TEXT,
    job_id TEXT,
    PRIMARY KEY (file_hash, folder_id)
);
```

#### sync_sessions
```sql
CREATE TABLE sync_sessions (
    id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    status TEXT NOT NULL DEFAULT 'running',
    files_scanned INTEGER DEFAULT 0,
    files_uploaded INTEGER DEFAULT 0,
    files_skipped INTEGER DEFAULT 0,
    files_failed INTEGER DEFAULT 0,
    bytes_uploaded INTEGER DEFAULT 0,
    snapshot_file_count INTEGER,
    snapshot_total_size INTEGER,
    snapshot_fingerprint TEXT,
    snapshot_capped INTEGER DEFAULT 0,
    errors_json TEXT,
    FOREIGN KEY(folder_id) REFERENCES sync_folders(id)
);
```

#### job_history
```sql
CREATE TABLE job_history (
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT,
    stats_json TEXT,
    created_at INTEGER
);
```

---

### 7.2 Frontend State Models

#### AppConfig
```typescript
interface AppConfig {
  activeToken: string;
  savedBots: SavedBot[];
  baseUrl?: string;
  telegramApiUrl?: string;
}
```

#### SavedBot
```typescript
interface SavedBot {
  name: string;
  token: string;
  avatar_filename?: string;
}
```

#### Resource
```typescript
interface Resource {
  id: number | string;
  name: string;
  type: 'user' | 'chat' | 'topic';
  thread_id?: number;
  real_chat_id?: number;
}
```

#### SyncFolder
```typescript
interface SyncFolder {
  id: string;
  name: string;
  source_path: string;
  target_chat_id: string;
  target_topic_id?: string;
  preset_id: string;
  preset_name?: string;
  enabled: boolean;
  status: 'idle' | 'syncing' | 'error';
  last_sync?: number;
  schedule_type: string;
  schedule_config: any;
  next_sync_due?: number;
  last_session_status?: string;
  snapshot_fingerprint?: string;
}
```

#### SyncJob
```typescript
interface SyncJob {
  jobId: string;
  name: string;
  status: 'scanning' | 'processing' | 'completed' | 'failed';
  currentFile?: string;
  progress: number;
  speed: string;
  eta: string;
  processedSize: string;
  totalSize: string;
  totalFilesDiscovered: number;
  filesSent: number;
  filesFailed: number;
  filesSkipped: number;
  totalBytesSent: number;
}
```

#### Preset
```typescript
interface Preset {
  id: string;
  name: string;
  rules: {
    extensions?: string[];
    exclude?: string[];
    minSize?: number;
    maxSize?: number;
    regex?: string;
    smartSplit?: boolean;
    smartSplitStrategy?: 're-encode' | 'copy';
    archiveMode?: 'zip_folder' | 'zip_indiv' | 'none';
    archiveSize?: number;
    archivePassword?: string;
  };
}
```

---

### 7.3 File Relationships

```
┌─────────────┐     ┌───────────────┐
│   presets   │◄────┤ sync_folders  │
└─────────────┘     └───────────────┘
                           │
                           │ preset_id
                           ▼
┌─────────────┐     ┌───────────────┐
│ sync_groups │────►│  sync_tasks   │
└─────────────┘     └───────────────┘
                           │
                           │ group_id
                           ▼
                    (references same structure
                     as sync_folders fields)

┌─────────────┐     ┌───────────────┐
│ sync_folders│────►│ sync_sessions │
└─────────────┘     └───────────────┘
     │                    │
     │ folder_id          │ folder_id
     ▼                    ▼
┌─────────────┐
│   registry  │
└─────────────┘
```

---

## 8. Error & Edge Case Handling

### 8.1 Network Errors

| Error | Handling |
|-------|----------|
| Timeout | Retry with exponential backoff |
| 429 Rate Limit | Queue request, pause processing |
| 500 Server Error | Display error banner, log to debug |
| Connection Lost | Show offline indicator, queue actions |

### 8.2 File System Errors

| Error | Handling |
|-------|----------|
| Path Not Found | Skip folder, mark as error |
| Permission Denied | Log error, continue with other files |
| File Modified During Sync | Use mtime from scan time |
| Disk Full | Stop sync, show critical warning |

### 8.3 Telegram API Errors

| Error | Handling |
|-------|----------|
| Invalid Token | Prompt to reconfigure bot |
| Chat Not Found | Skip target, log error |
| Message Not Modified | Ignore (already same content) |
| Flood Control | Respect retry-after header |
| File Too Large | Split into chunks |
| Invalid File Type | Send as document fallback |

### 8.4 Data Integrity

| Scenario | Handling |
|----------|----------|
| Duplicate Bot Token | Skip network calls, instant switch |
| Corrupted Database | Attempt recovery, offer reset |
| Missing Resources | Fetch on-demand |
| Clock Regression | Detect and recalculate schedules |

### 8.5 UI Edge Cases

| Scenario | Handling |
|----------|----------|
| Very Long Paths | Truncate with ellipsis, tooltip on hover |
| Many Queue Items | Virtual scrolling (not implemented, limitation) |
| Slow Network | Show loading states, disable duplicate submits |
| Small Screens | Horizontal scroll for chips, stacked layouts |

---

## 9. Constraints the UI Must Respect

### 9.1 Technical Constraints

1. **Telegram File Size Limit**: 2GB per file (must split larger)
2. **Rate Limits**: 
   - ~30 messages/second global
   - ~1 message/second per chat
3. **Browser Limitations**:
   - No direct filesystem access (requires backend)
   - Limited metadata extraction (client-side only)
   - Memory constraints for large file handling
4. **Mobile Constraints**:
   - Touch targets minimum 44x44px
   - Safe area insets for notched devices
   - Reduced animations option

### 9.2 Design Constraints

1. **Theme Consistency**: Must use CSS variable tokens
2. **Responsive Breakpoints**: 1024px desktop/mobile switch
3. **Font Loading**: Gilroy from CDN (fallback required)
4. **Icon Set**: Lucide React only
5. **Animation Duration**: 200-300ms for transitions

### 9.3 Backend Dependencies

1. **FFmpeg Required**: For metadata extraction and thumbnails
2. **7-Zip Required**: For archive creation
3. **SQLite**: For data persistence
4. **Node.js Backend**: All file operations proxied

### 9.4 Security Constraints

1. **Path Traversal Prevention**: All paths validated against SCAN_ROOT
2. **Token Storage**: Stored in config.json (not encrypted)
3. **No Server-Side Auth**: Single-user assumption
4. **CORS**: Backend serves frontend (same origin in production)

---

## 10. Future Roadmap

### 10.1 Planned Features

#### Phase 1: Core Improvements
- [ ] **Virtual Scrolling** for large lists (Database Manager, Registry)
- [ ] **Keyboard Shortcuts** for power users
- [ ] **Search in Dropdowns** for bot/resource selection
- [ ] **Batch Operations** in Database Manager
- [ ] **Export/Import** individual presets and folders

#### Phase 2: Enhanced Sync
- [ ] **Real-Time Progress** with WebSocket
- [ ] **Parallel Uploads** with configurable concurrency
- [ ] **Preview Before Sync** (diff view)
- [ ] **Selective Sync** (checkbox per file)
- [ ] **Bandwidth Throttling** options

#### Phase 3: Advanced Features
- [ ] **Multi-User Support** with authentication
- [ ] **Webhook Mode** instead of polling
- [ ] **Inline Bot** for Telegram search
- [ ] **Mobile App** (React Native)
- [ ] **Plugin System** for custom processors

#### Phase 4: Intelligence
- [ ] **AI-Powered Organization** (auto-categorize files)
- [ ] **Smart Scheduling** (learn optimal times)
- [ ] **Duplicate Detection** across folders
- [ ] **Storage Analytics** dashboard
- [ ] **Predictive ETA** using historical data

### 10.2 Known Technical Debt

1. **Polling Architecture**: Should migrate to WebSocket for real-time updates
2. **State Management**: Currently using useState/prop drilling; consider Zustand or Redux
3. **API Consistency**: Some endpoints return different structures
4. **Error Boundaries**: Missing React error boundaries
5. **Testing**: No automated test suite
6. **Accessibility**: ARIA labels incomplete
7. **TypeScript Coverage**: Some `any` types should be properly typed

### 10.3 Performance Optimizations Needed

1. **Bundle Size**: Currently ~2MB; target <500KB
2. **Initial Load**: Add code splitting per route
3. **Re-renders**: Memoize expensive components
4. **Database Queries**: Add indexes for common lookups
5. **Image Optimization**: Lazy load avatars and previews

---

## Appendix A: File Structure Reference

```
teleman/
├── src/
│   ├── api/
│   │   ├── bridge.ts          # API client wrapper
│   │   └── telegram.ts        # Telegram API caller
│   ├── backend/
│   │   ├── autosyncer.ts      # Sync engine logic
│   │   ├── configManager.ts   # Config file handling
│   │   ├── db.ts              # SQLite operations
│   │   ├── debugLogger.ts     # Logging service
│   │   ├── fontGenerator.ts   # Font preview generation
│   │   ├── rateLimiter.ts     # Request throttling
│   │   ├── scheduler.ts       # Cron-like scheduling
│   │   ├── telegramBot.ts     # Bot polling service
│   │   └── zipManager.ts      # Archive creation
│   ├── components/
│   │   ├── common/
│   │   │   └── ResponsiveModal.tsx
│   │   ├── layout/
│   │   │   └── PageLayout.tsx
│   │   ├── navigation/
│   │   │   └── ModernSidebar.tsx
│   │   ├── ActiveJobCard.tsx
│   │   ├── AddFolderModal.tsx
│   │   ├── AnalysisDashboard.tsx
│   │   ├── BotSelector.tsx
│   │   ├── DatabaseManager.tsx
│   │   ├── FolderCard.tsx
│   │   ├── FolderPicker.tsx
│   │   ├── GroupCard.tsx
│   │   ├── GroupEditorModal.tsx
│   │   ├── JobHistoryTable.tsx
│   │   ├── MobileNav.tsx
│   │   ├── ModernBottomNav.tsx
│   │   ├── ModernHeader.tsx
│   │   ├── PresetManager.tsx
│   │   ├── QueueManager.tsx
│   │   ├── SettingsModal.tsx
│   │   ├── SyncErrorModal.tsx
│   │   ├── SyncGroupEditor.tsx
│   │   ├── SystemStatusPanel.tsx
│   │   ├── TargetsManager.tsx
│   │   ├── TopicSelector.tsx
│   │   ├── VitalSignsHeader.tsx
│   │   └── WelcomeScreen.tsx
│   ├── context/
│   │   └── ThemeContext.tsx
│   ├── layouts/
│   │   └── AppLayout.tsx
│   ├── pages/
│   │   ├── AutoSyncer.tsx
│   │   ├── BatchSender.tsx
│   │   ├── LogsPage.tsx
│   │   └── Playground.tsx
│   ├── assets/
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── server.ts                   # Express backend
├── data/                       # Persistent storage
│   ├── config.json
│   ├── resources.json
│   └── commander.sqlite
├── public/
├── docs/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

---

## Appendix B: Color Reference

### Modern Theme (Default)
| Token | Value | Usage |
|-------|-------|-------|
| `--color-canvas` | `#000000` | App background |
| `--color-surface` | `#121212` | Cards, panels |
| `--color-surface-highlight` | `#1E1E1E` | Elevated surfaces |
| `--color-border` | `#2D2D2D` | Dividers, borders |
| `--color-primary` | `#BB86FC` | Primary actions |
| `--color-primary-hover` | `#D0BCFF` | Hover states |
| `--color-on-primary` | `#000000` | Text on primary |
| `--color-text-main` | `#FFFFFF` | Primary text |
| `--color-text-muted` | `#B0B0B0` | Secondary text |

### Legacy Theme
| Token | Value | Usage |
|-------|-------|-------|
| `--color-canvas` | `#020617` | App background |
| `--color-surface` | `#0f172a` | Cards, panels |
| `--color-surface-highlight` | `#1e293b` | Elevated surfaces |
| `--color-border` | `#334155` | Dividers, borders |
| `--color-primary` | `#2563eb` | Primary actions |
| `--color-primary-hover` | `#3b82f6` | Hover states |
| `--color-on-primary` | `#ffffff` | Text on primary |
| `--color-text-main` | `#f1f5f9` | Primary text |
| `--color-text-muted` | `#94a3b8` | Secondary text |

---

## Appendix C: Icon Reference (Lucide React)

| Icon | Usage |
|------|-------|
| `Terminal` | App logo, Playground |
| `LayoutDashboard` | Playground nav |
| `Folders` | Batch Sender nav |
| `Settings` | Auto-Syncer nav, Settings |
| `Bot` | Bot selector, avatars |
| `Send` | Send buttons |
| `Play` | Run sync |
| `PauseCircle` | Polling paused |
| `RefreshCw` | Refresh actions |
| `Trash2` | Delete actions |
| `Pencil` | Edit actions |
| `Plus` | Add actions |
| `X` | Close, cancel |
| `Check` | Success, active |
| `AlertCircle` | Warnings |
| `AlertTriangle` | Errors |
| `Loader2` | Loading spinners |
| `FolderOpen` | Folder operations |
| `Database` | Database manager |
| `Target` | Targets manager |
| `PlayCircle` | Queue |
| `FileText` | Logs |
| `Layers` | Presets, groups |
| `Upload` | Batch sender |
| `Download` | Backup |
| `Search` | Search inputs |
| `ChevronDown/ChevronUp` | Expand/collapse |
| `ChevronLeft/ChevronRight` | Navigation |
| `GripVertical` | Drag handles |
| `SkipForward` | Skip file |
| `StopCircle` | Stop job |
| `Wand2` | Smart features |
| `Video` | Video files |
| `Archive` | Archive mode |
| `Copy` | Copy stream |
| `User` | Users |
| `MessageSquare` | Chats |
| `Hash` | Topics |
| `Cpu` | CPU stat |
| `Activity` | RAM stat |
| `HardDrive` | Disk stat |
| `Home` | Folder picker root |
| `Network` | Network settings |
| `Palette` | Appearance |
| `Type` | Font settings |
| `Sliders` | Settings link |
| `BookOpen` | API docs |
| `Braces` | JSON prettify |
| `History` | Method history |
| `CheckCircle2` | Success status |
| `Scan` | Resource scanner |
| `Save` | Save actions |
| `Beaker` | Regex tester |
| `Clock` | Session history |
| `Calendar` | Schedule |
| `ArrowUpDown` | Sort toggle |

---

**End of Document**
