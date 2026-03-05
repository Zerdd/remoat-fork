# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Remoat

Remoat is a local Telegram bot (grammy) that remotely operates Antigravity (an AI coding assistant) via Chrome DevTools Protocol (CDP). No external server — runs entirely on the user's PC. Users control Antigravity from their smartphone through Telegram.

## Commands

```bash
npm test                # Run unit tests (jest, excludes e2e)
npm run test:unit       # Same as npm test
npm run test:integration # Run integration tests (e2e.bot.test.ts)
npm run test:watch      # Jest watch mode
npm run build           # TypeScript compilation (tsc)
npm run dev             # Dev mode with auto-reload (ts-node-dev)
npm start               # Run from source (ts-node)
npm start -- setup      # Run setup wizard from source
npm run start:built     # Run from compiled dist/
```

Run a single test file: `npx jest tests/path/to/file.test.ts`

Note: jest.config.js ignores `responseMonitor.test.ts` and `responseMonitor.stopButtonSelector.test.ts` by default (these are large, slow test files).

## Architecture

Three-layer design: **CLI → Bot → Services/DB**

- **`src/bin/`** — Commander CLI with subcommands: `start`, `setup`, `doctor`, `open`
- **`src/bot/index.ts`** — Main bot file (~63KB); grammy Telegram event handling, message routing, callback queries
- **`src/commands/`** — Slash command handlers (`/project`, `/new`, `/chat`, `/model`, `/mode`, `/template`, `/stop`, `/screenshot`, `/status`, `/autoaccept`, `/cleanup`, `/help`) and message parser
- **`src/services/`** — Core business logic (26 files):
  - **CDP integration**: `cdpService.ts`, `cdpBridgeManager.ts`, `cdpConnectionPool.ts` — WebSocket communication with Antigravity
  - **Response monitoring**: `responseMonitor.ts` (~42KB) — DOM polling at 2-second intervals with dual output streams (AI response text + activity log), completion detection via stop-button absence (3 consecutive checks for flicker resilience), baseline suppression to ignore previous turn content
  - **Feature detectors**: `approvalDetector.ts`, `planningDetector.ts`, `errorPopupDetector.ts`, `userMessageDetector.ts`
  - **Session/workspace management**: `chatSessionService.ts`, `workspaceService.ts`, `telegramTopicManager.ts`
  - **Execution**: `promptDispatcher.ts`, `progressSender.ts`, `autoAcceptService.ts`
- **`src/database/`** — SQLite via better-sqlite3; repositories for sessions, workspace bindings, templates, schedules
- **`src/ui/`** — Telegram InlineKeyboard builders
- **`src/utils/`** — Config loading, logging, Telegram formatting, HTML-to-markdown conversion, path security, i18n
- **`src/middleware/`** — Auth (whitelist-based user ID) and input sanitization

## Key Technical Details

- **TypeScript strict mode**, target ES2022, CommonJS modules
- **Path alias**: `@/` maps to `src/` in jest.config.js `moduleNameMapper` only (for tests). Source code uses relative imports (`./`, `../`)
- **Data flow**: Telegram long-polling (no webhooks) → auth middleware → command routing → CDP injection into Antigravity → DOM polling for responses → chunked/streamed back to Telegram (max 4096 chars/message)
- **Config**: `.env` file or `~/.config/remoat/config.json` (see `src/utils/configLoader.ts`). Key env vars:
  - `TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_IDS` (required)
  - `WORKSPACE_BASE_DIR` — projects parent directory
  - `USE_TOPICS` — Telegram Forum Topics (default: true)
  - `EXTRACTION_MODE` — `structured` or `legacy` (default: structured)
  - `AUTO_APPROVE_FILE_EDITS`, `LOG_LEVEL`, `ANTIGRAVITY_PATH`
- **Database**: Local SQLite file (`antigravity.db`) with 4 tables: `chat_sessions`, `workspace_bindings`, `prompt_templates`, `schedules`
- **Optional features**: Voice transcription requires optional deps `nodejs-whisper` and `ffmpeg-static`
- **i18n**: Translations in `locales/` (en, ja) loaded via `src/utils/i18n.ts`

## Documentation

- `docs/ARCHITECTURE.md` — System overview and design rationale
- `docs/RESPONSE_MONITOR.md` — DOM polling strategy, dual output streams, scored selectors
- `docs/ANTIGRAVITY_DOM_SELECTORS.md` — DOM selector reference (critical for CDP interaction code)
- `docs/dom-inspection-guide.md` — How to find new selectors

## Code Conventions

- **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`
- Prefer `interface` over `type` for object definitions
- Prefer `const` over `let`; avoid direct object/array mutation (use spread)
- No linter configured — rely on `tsc` for type checking
