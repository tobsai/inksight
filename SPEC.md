# InkSight — Product Spec
Last updated: 2026-03-11

## Vision & Goals
CLI tool (and eventual npm package) that transforms reMarkable Paper Pro handwritten notes via AI. The vision: your handwriting → OCR, clean diagrams, summaries, and searchable knowledge — all from the command line.

Target user: knowledge workers and students with reMarkable devices who want their handwritten notes in a machine-readable, searchable form without manual typing.

## Current Status
🟡 **Phases 1–7 complete, Phase 8 (public release) pending**

- ✅ reMarkable Cloud API integration (auth, doc list, download)
- ✅ SSH device client (direct device access at `10.11.99.1`)
- ✅ `.rm` binary format parser (v5 + v6, Paper Pro uses v6)
- ✅ Stroke → PNG renderer using Node.js Canvas API
- ✅ All AI transformers: OCR, diagram cleanup, summarization, metadata extraction, smart search
- ✅ Multi-provider AI: OpenAI (GPT-4o vision) + Anthropic (Claude)
- ✅ SQLite storage + FTS5 full-text search
- ✅ CLI with setup wizard, `list`, `transform`, `batch` commands
- ✅ Parallel page processing + AI batch requests
- ✅ Retry with exponential backoff + Retry-After support
- ✅ 642 tests (all mocked, all passing)
- ⏳ npm publish (Phase 8)
- ⏳ GitHub release + changelog
- ⏳ Web interface (Phase 9+)

## Key Features

### Cloud Sync
Authenticates with `my.remarkable.com` → downloads documents as ZIP archives → extracts `.rm` pages.

### SSH Mode
Direct device SSH to `10.11.99.1` (USB or Wi-Fi). Useful for offline use or if cloud sync is slow.

### Transformers
| Transformer | What It Does |
|------------|-------------|
| OCR | Handwriting → text |
| Diagram | Rough sketches → clean SVG/Mermaid |
| Summarize | Long notes → concise summary |
| Metadata | Extracts title, date, topics, tags |
| Search | FTS5 query across all transformed notes |

### Storage
SQLite at `~/.inksight/db.sqlite`. Full-text search via FTS5. Cost tracking per AI call.

### CLI Commands
```bash
inksight setup          # Setup wizard (API keys, device, provider choice)
inksight list           # List documents from reMarkable Cloud
inksight transform <id> # Transform a document with AI
inksight batch          # Batch-process multiple documents
```

## Technical Architecture
- Node.js 18+ ESM TypeScript
- Build: `tsc` → `dist/` (must build before running)
- AI providers: `src/ai/openai-provider.ts` and `src/ai/anthropic-provider.ts`
- All providers wrapped in `withRetry()` for reliability
- `ParallelProcessor` handles concurrent page rendering (default: 4 workers)
- `InkSightDatabase` wraps all SQLite ops in `StorageError` boundaries

## Deployment
- No server deployment — local CLI tool
- **npm package name**: `inksight` (planned, not yet published)
- **GitHub**: https://github.com/tobsai/inksight
- **Linear project**: `984ea93c-7c1d-4ff6-ad4c-ea532e4d3185`

### User Env Vars
| Var | Purpose |
|-----|---------|
| `REMARKABLE_TOKEN` | Cloud API token (from my.remarkable.com) |
| `OPENAI_API_KEY` | OpenAI provider |
| `ANTHROPIC_API_KEY` | Anthropic provider |
| `REMARKABLE_SSH_HOST` | Device IP (default: `10.11.99.1`) |
| `REMARKABLE_SSH_USER` | SSH user (default: `root`) |
| `REMARKABLE_SSH_PASSWORD` | Device SSH password |

## Known Limitations / Tech Debt
- Not yet published to npm — users must clone and `npm link`
- No web interface
- No mobile app
- `src/` contains C++ files alongside TypeScript (legacy code from earlier iteration?) — unclear if used
- Phase 7 (performance) listed as ⏳ in CLAUDE.md but also as ✅ complete — ROADMAP.md is authoritative

## Roadmap / Next Steps
1. **Phase 8**: Bump version → `1.0.0`, verify `bin` entry, write CHANGELOG.md
2. **Phase 8**: `npm publish`, GitHub release
3. **Phase 9**: Web interface (companion app to CLI)
4. **Phase 10**: Mobile apps
5. **Future**: On-device AI, fine-tuned handwriting models
