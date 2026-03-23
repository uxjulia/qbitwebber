# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (proxies /api to qBittorrent backend)
npm run demo         # Start dev server in demo mode (no backend required)
npm run build        # Type-check + build for production
npm run release      # Build + copy dist to release/public
npm run lint         # Run ESLint
npm run preview      # Preview production build locally
```

There are no tests in this project.

## Architecture

**What it is:** A minimalist React SPA that serves as an alternative web UI for qBittorrent.

**Data flow:** The Vite dev server proxies all `/api` requests to the qBittorrent backend (configured in [vite.config.ts](vite.config.ts)). The `QBittorrentClient` class in [src/lib/api.ts](src/lib/api.ts) wraps all qBittorrent v2 API endpoints and exports a singleton `qbitClient`. In production, the built files are served by qBittorrent itself from its web UI directory.

**Authentication:** `AuthProvider` in [src/hooks/useAuth.tsx](src/hooks/useAuth.tsx) stores credentials in `localStorage` (`qbit_user`, `qbit_pass`) and manages the session cookie (SID). Auto-login is attempted on startup if credentials are saved.

**State management:** TanStack React Query handles all server state. Custom hooks in [src/hooks/useApi.ts](src/hooks/useApi.ts) wrap React Query with auto-refetch intervals (transfer info: 3s, torrents: 5s, logs: 5s).

**UI structure:** Tab-based layout — `App.tsx` owns tab routing (torrents, add, rss, search, logs, settings). `Layout.tsx` provides responsive navigation (desktop sidebar + mobile bottom nav + hamburger menu).

**Demo mode:** Setting `VITE_DEMO_MODE=true` swaps `qbitClient` for the mock `demoClient` from [src/lib/demoClient.ts](src/lib/demoClient.ts), enabling development without a running qBittorrent instance.

**Component library:** [shadcn/ui](components.json) ("new-york" style) with Radix UI primitives. Add new components via the shadcn CLI; they land in [src/components/ui/](src/components/ui/).

**Path alias:** `@/` maps to `src/`.
