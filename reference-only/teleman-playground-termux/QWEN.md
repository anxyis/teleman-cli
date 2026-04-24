# TeleMan Playground - Project Context

## Project Overview

**TeleMan** is an all-in-one Telegram Bot management platform designed for developers and power users. It provides three core features:

1. **API Playground** - Interactive tool for testing raw Telegram Bot API methods with custom parameters, file attachments, and real-time JSON response viewing
2. **Batch Sender** - Production-grade mass media uploader with smart queueing, rate limiting, large file splitting (>2GB), and media metadata extraction (ID3 tags, video dimensions)
3. **Auto Syncer** - Advanced filesystem synchronization engine that watches directories and automatically uploads content to Telegram channels/groups with fingerprinting, preset rules, and undo capabilities

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, TypeScript, TailwindCSS, Framer Motion |
| Backend | Node.js + Express (TypeScript) |
| Database | SQLite (better-sqlite3 with sql.js fallback) |
| Media | fluent-ffmpeg, ffprobe, music-metadata-browser |
| State | React Context API |
| Routing | React Router v7 |

### Architecture

```
teleman-playground-termux/
├── src/
│   ├── pages/           # Main feature pages (Playground, BatchSender, AutoSyncer)
│   ├── components/      # Reusable UI components (SettingsModal, BotSwitcher)
│   ├── backend/         # Server-side logic (autosyncer, db, telegramBot, scheduler)
│   ├── api/             # API client utilities
│   ├── context/         # React context providers (Theme, etc.)
│   ├── layouts/         # Layout components (AppLayout)
│   └── assets/          # Static assets
├── server.ts            # Express backend (API proxy, file scanning, rate limiting)
├── data/                # Persistent storage (SQLite DB, configs, avatars, themes)
├── public/              # Vite public assets
└── docs/                # Technical documentation
```

## Building and Running

### Prerequisites

- **Node.js** v18+
- **FFmpeg** (required for media metadata extraction)
- **Termux** (Android environment) - optional, project is Termux-optimized
- **ImageMagick** & **p7zip** (optional, for advanced features)

### Development Mode

The application requires **two terminals** for development:

```bash
# Terminal 1 - Backend Server
npm run server

# Terminal 2 - Frontend Dev Server
npm run dev
```

Access at `http://localhost:5173`

### Production Build

```bash
# Build frontend
npm run build

# Run production server (serves built frontend)
npm run server
```

### Termux-Specific Launch

The project includes Android/Termux-optimized scripts:

```bash
# Full setup and launch (copies app to internal storage if needed)
bash start.sh

# Individual commands (after setup)
start-tg    # Start in background tmux session
stop-tg     # Stop server
debug-tg    # Generate debug logs
update-tg   # Pull, build, and restart
```

### Environment Configuration

Create a `.env` file or configure via Settings UI:

```bash
VITE_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
VITE_API_BASE_URL=http://192.168.0.7:8181
TEMP_WORK_DIR=./temp_work
```

Runtime environment variables (for server):
- `DATA_DIR` - Path to persistent data storage (default: `./data`)
- `SCAN_ROOT` - Root directory for auto-sync scanning
- `PORT` - Server port (default: 3000)

## Development Conventions

### Code Style

- **TypeScript** - Strict typing enforced via `tsconfig.json`
- **ESLint** - Configured with React Hooks and React Refresh plugins
- **TailwindCSS** - Mobile-first responsive design with utility classes
- **Component Pattern** - Functional components with hooks

### Linting & Type Checking

```bash
npm run lint    # ESLint check
npm run build   # TypeScript compilation + Vite build
```

### Key Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies and npm scripts |
| `tsconfig.json` | TypeScript configuration (solution-style) |
| `vite.config.ts` | Vite bundler config with React plugin and API proxy |
| `tailwind.config.js` | TailwindCSS customization |
| `eslint.config.js` | ESLint rules |
| `server.ts` | Express backend entry point |

### Database Schema

The application uses SQLite with the following core tables:
- `presets` - Sync preset configurations
- `sync_folders` / `sync_groups` / `sync_tasks` - Sync job definitions
- `registry` - File fingerprint tracking (prevents duplicate uploads)
- `sync_sessions` - Real-time sync session tracking
- `job_history` - Historical job records
- `resources` - Cached Telegram users/chats/topics (JSON file)

### Backend Services

| Service | File | Purpose |
|---------|------|---------|
| `AutoSyncer` | `src/backend/autosyncer.ts` | Core sync engine, file scanning, upload queue |
| `TelegramBotService` | `src/backend/telegramBot.ts` | Bot polling, message handling |
| `Scheduler` | `src/backend/scheduler.ts` | Cron-based job scheduling |
| `RateLimiter` | `src/backend/rateLimiter.ts` | Telegram API rate limiting |
| `FontGenerator` | `src/backend/fontGenerator.ts` | Font preview image generation |
| `ZipManager` | `src/backend/zipManager.ts` | Archive creation for large folders |

### Frontend Pages

| Page | Route | Component |
|------|-------|-----------|
| API Playground | `/` | `Playground.tsx` |
| Batch Sender | `/batch` | `BatchSender.tsx` |
| Auto Syncer | `/autosyncer` | `AutoSyncer.tsx` |
| Logs | `/autosyncer/logs` | `LogsPage.tsx` |

### Responsive Design Notes

- **Mobile-first** TailwindCSS approach
- **Breakpoint inconsistency** exists between components (see `docs/frontend-architecture/`)
- Modals use dual-mode: Full-screen sheet (mobile) vs centered dialog (desktop)
- Navigation: Bottom bar (mobile) with known padding issues on desktop layouts

### Data Persistence

All user data is stored in `data/`:
- `config.json` - Bot tokens and app settings
- `resources.json` - Cached Telegram entities
- `commander.sqlite` - Main database
- `avatars/` - Bot profile images
- `themes/`, `fonts/` - Customization assets
- `temp_work/` - Temporary upload staging

## Known Technical Debt

1. **Decentralized responsive logic** - Padding/height calculations duplicated across components
2. **Navigation contract violation** - Modern layout obscures content on desktop
3. **Missing scroll locking** - Modals don't prevent background scrolling
4. **Tablet gap** - Inconsistent breakpoint definitions (640px vs 1024px)

## Testing

No formal test suite is configured. Testing practices:
- Manual testing via UI
- Debug script (`debug-tg`) for log capture
- Verification scripts exist in root (`verify_*.py`) for specific fixes

## External Dependencies

- **Telegram Bot API** - Local or cloud instance (configurable via `telegram_api_url`)
- **Local API Server** - Default: `http://192.168.0.7:8181` (self-hosted Telegram)
