# InkSight — Project Source of Truth
Last updated: 2026-02-22

## What This Is
InkSight is a CLI tool (and eventually npm package) that transforms reMarkable Paper Pro handwritten notes via AI — offering OCR, diagram cleanup, summarization, smart search, and metadata extraction. It connects to reMarkable via Cloud API or direct SSH.

## Status
🟡 **Phases 1–6 Complete** — All core phases done through CLI & UX (Phase 6). Currently entering Phase 7 (Performance Optimization). Phase 8 is public release (npm publish, GitHub release). Not yet publicly released.

- ✅ Phases 1–6: Cloud API client, SSH device client, file monitoring, AI providers (OpenAI + Anthropic), image rendering, all transformers, SQLite storage, FTS5 search, CLI
- ⏳ Phase 7: Performance optimization (parallel processing, memory tuning, streaming)
- ⏳ Phase 8: v1.0 release — npm publish, GitHub release, community

## Stack
- **Runtime**: Node.js 18+, TypeScript (ESM, `"type": "module"`)
- **Build**: `tsc` → `dist/`
- **CLI**: `inksight` binary at `dist/cli/index.js`
- **AI providers**: OpenAI SDK (`openai`) + Anthropic SDK (`@anthropic-ai/sdk`)
- **reMarkable**: Custom Cloud API client + SSH (`ssh2` / sftp)
- **Storage**: `better-sqlite3` (local SQLite), FTS5 for full-text search
- **Image rendering**: `canvas` npm package (renders `.rm` binary format to PNG)
- **ZIP handling**: `jszip` (extracting reMarkable document ZIPs)
- **Testing**: Vitest (302+ tests, all mocked, no real API calls in test suite)
- **Linting/format**: ESLint + Prettier

## Deployment
- **No server/cloud deployment** — this is a local CLI tool run by the user on their machine
- **npm package**: Intended for `npm publish` in Phase 8 (not yet published)
- **GitHub repo**: https://github.com/tobsai/inksight
- **Key env vars** (user's `.env`):
  - `REMARKABLE_TOKEN` — reMarkable Cloud API token (from my.remarkable.com)
  - `OPENAI_API_KEY` — for OpenAI provider (GPT-4o vision)
  - `ANTHROPIC_API_KEY` — for Anthropic provider (Claude)
  - `REMARKABLE_SSH_HOST` — device IP for SSH mode (default: `10.11.99.1`)
  - `REMARKABLE_SSH_USER` — SSH user (default: `root`)
  - `REMARKABLE_SSH_PASSWORD` — device SSH password
- **Linear project**: `984ea93c-7c1d-4ff6-ad4c-ea532e4d3185`

## Current Focus / Next Steps
1. **Phase 7**: Performance optimization — parser tuning, parallel page processing, AI batch requests, streaming responses
2. **Phase 7**: Comprehensive error handling + recovery mechanisms
3. **Phase 7**: 80%+ code coverage, integration test suite
4. **Phase 8**: `npm publish`, GitHub release with release notes, announcement
5. **Future (Phase 9+)**: Web interface, mobile apps, on-device AI

## Key Files & Structure
```
inksight/
├── src/
│   ├── cloud/              # reMarkable Cloud API client (auth, doc list/download)
│   ├── device/             # SSH client (connect, list files, download, file monitoring)
│   ├── parser/             # .rm binary format parser (v5/v6)
│   ├── renderer/           # Stroke-to-image renderer (rm-parser → canvas → PNG)
│   │   ├── rm-parser.ts    # Binary .rm file decoder
│   │   ├── page-renderer.ts
│   │   ├── render-cache.ts # LRU cache for rendered pages
│   │   └── document-renderer.ts
│   ├── ai/                 # AI provider abstraction
│   │   ├── provider.ts     # Base interface + registry
│   │   ├── openai-provider.ts
│   │   └── anthropic-provider.ts
│   ├── transformers/       # Text, diagram, summarization, metadata transformers
│   ├── storage/            # SQLite DB (InkSightDatabase) + SearchIndex (FTS5) + CacheManager
│   ├── cli/                # CLI commands (setup wizard, list, transform, batch)
│   └── index.ts            # Public API exports
├── tests/                  # Vitest unit tests (all mocked)
├── docs/                   # user-guide.md, API.md, faq.md, troubleshooting.md
├── ROADMAP.md              # Phase-by-phase development plan (authoritative status)
├── ARCHITECTURE.md         # System design + data flow
└── package.json
```

## Agent Rules
- **No real API calls in tests** — all tests are fully mocked. Keep it that way.
- **ESM modules** — `"type": "module"` in package.json. Use `import`/`export`, not `require`/`module.exports`.
- **Build before run** — TypeScript must be compiled (`npm run build`) before `inksight` CLI works. There's no ts-node setup.
- **ROADMAP.md is the authoritative source for phase status** — check it before making claims about what's done.
- The `.rm` parser supports format versions 5 and 6. The reMarkable Paper Pro uses v6.
- Cost tracking is built in (`CostTracker`) — AI calls log their costs to a local file. Don't bypass it.
- Phase 8 (npm publish) requires bumping version in `package.json` and verifying the `bin` entry points to compiled output.
