# Changelog

All notable changes to InkSight are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.0] — 2026-03-02

First public release. All eight development phases complete.

### Summary
InkSight is a production-ready CLI and library for transforming reMarkable Paper Pro handwritten notes and drawings through AI. Supports cloud sync, direct SSH access, multi-provider AI (OpenAI & Anthropic), and a full offline/hybrid mode.

---

## Phase History

### Phase 7 — Performance & Resilience *(Feb 2026)*
- `ParallelProcessor` for concurrency-limited parallel workloads
- `renderAllPages()` now uses parallel processing (default 4 concurrent pages)
- AI batch processing with configurable concurrency
- Retry logic with exponential backoff for flaky AI providers
- `StorageError` boundaries — typed errors from all database operations
- 642 tests passing across 21 test suites

### Phase 6 — UX & Polish *(Feb 2026)*
- Interactive CLI with Inquirer prompts
- Progress spinners (Ora) for long-running operations
- Human-readable error messages throughout
- `--watch` mode for continuous document monitoring
- Configuration wizard for first-run setup

### Phase 5 — Storage & Caching *(Jan–Feb 2026)*
- SQLite-backed local database via `better-sqlite3`
- Document index with metadata (title, modified, page count)
- Transform result cache — skip re-processing unchanged pages
- Render cache with content-addressed keys
- Offline queue — enqueue transforms when AI is unreachable

### Phase 4 — AI Transformations *(Jan 2026)*
- OpenAI GPT-4o and Anthropic Claude integration
- Handwriting-to-text (HTR) with layout preservation
- Diagram vectorisation and cleanup
- Document summarisation and bullet extraction
- Smart semantic search over stored documents
- Provider-agnostic `AIProvider` interface for easy extension

### Phase 3 — Rendering Pipeline *(Jan 2026)*
- `.rm` binary file parser (reMarkable format v6)
- SVG and PNG page renderer with stroke reconstruction
- `DocumentRenderer` orchestrating parse → render → cache
- AI-ready image sizing (target 500 KB) with automatic downscaling

### Phase 2 — Device Integration *(Dec 2025–Jan 2026)*
- SSH client for direct reMarkable device access
- File monitor watching `~/.local/share/remarkable/xochitl/` for changes
- USB connection support
- Hybrid client: seamlessly switches between cloud and SSH

### Phase 1 — Cloud Foundation *(Dec 2025)*
- reMarkable Cloud API authentication (OAuth2 device flow)
- Document list and download (`.rm` + metadata)
- Token refresh and persistent credential storage
- Rate-limited HTTP client with retry

### Phase 0 — Project Scaffolding *(Dec 2025)*
- TypeScript + ESM project structure
- Vitest test harness
- ESLint + Prettier configuration
- CI workflow (GitHub Actions)
- Architecture and roadmap documentation

---

[1.0.0]: https://github.com/talosgunn/inksight/releases/tag/v1.0.0
