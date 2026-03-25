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

## qBittorrent API Notes

**v4 vs v5 parameter naming:** The API changed `paused=true` (v4) to `stopped=true` (v5) when adding torrents. In `api.ts`, the `paused` option maps to `stopped=true` in the form data to target v5. A torrent added with `stopped=true` on v5 will **not** download metadata for magnet links — it is fully stopped.

**Torrent states:** `metaDL` / `forcedMetaDL` mean metadata is still being fetched (magnet links). States like `stoppedDL`, `pausedDL`, `downloading`, `uploading`, `seeding` etc. mean metadata is available and `getTorrentFiles` will return results. The `STATE_PRIORITY` map in `TorrentsView.tsx` defines the display sort order.

**File priorities:** `setFilePriority` with priority `0` = skip (don't download), `1` = normal. This is how per-file selection works in the torrent preview.

## Torrent Preview Dialog (`TorrentPreviewDialog.tsx`)

Two distinct flows depending on input type:

- **`.torrent` file:** Parsed entirely in the browser using a built-in bencode decoder (`parseTorrentFile`). No torrent is added to qBittorrent during preview. On Download, the file is added with `paused: true`, deselected file priorities are set to 0, then it is resumed.
- **Magnet / HTTP URL:** Torrent is added to qBittorrent without `paused`, allowed to run so metadata can download, then paused once metadata is ready. On cancel, the torrent is deleted. On Download, it is resumed.

## shadcn/ui Gotchas

`DialogContent` in `src/components/ui/dialog.tsx` had a hardcoded `sm:max-w-lg` default that overrides any `max-w-*` passed via `className` (Tailwind can't merge conflicting utilities). This has been removed — pass `max-w-*` directly on each `DialogContent` usage.
