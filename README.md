# InkSight

> **Transform your reMarkable handwriting into structured, searchable, AI-enhanced content.**

[![CI](https://github.com/talosgunn/inksight/actions/workflows/ci.yml/badge.svg)](https://github.com/talosgunn/inksight/actions)
[![npm version](https://img.shields.io/npm/v/inksight.svg)](https://www.npmjs.com/package/inksight)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

---

## What is InkSight?

InkSight is a CLI and Node.js library that connects your **reMarkable Paper Pro** to AI, letting you:

- 📝 **Convert handwriting to text** — accurate HTR with layout preservation
- 🔍 **Search handwritten notes** — semantic search across your entire notebook library
- 📊 **Clean up diagrams** — vectorise and export hand-drawn sketches
- 🗒️ **Summarise long notes** — GPT-4o or Claude distills pages into bullets
- 🔄 **Sync automatically** — watch for new documents via Cloud API or direct SSH

Works offline. Supports both reMarkable Cloud sync and direct SSH/USB access.

---

## Quick Start

### Install

```bash
npm install -g inksight
```

### Configure

```bash
inksight setup
```

This wizard will walk you through:
1. Authenticating with reMarkable Cloud (or entering your device IP for SSH)
2. Adding your OpenAI or Anthropic API key
3. Choosing a local storage path for the cache database

### Convert a document

```bash
# List documents synced from your device
inksight list

# Convert handwriting to text
inksight transform --type htr "My Meeting Notes"

# Summarise a document
inksight transform --type summarise "Research Notes"

# Search across all documents
inksight search "project timeline"
```

### Sync to an Obsidian vault

Write transformed notes directly into an Obsidian vault as Markdown files with
YAML frontmatter. InkSight stamps each note with `source: remarkable` so you
can filter by origin inside Obsidian.

```bash
# Write a note to your vault (title becomes the filename)
inksight transform "Meeting Notes" --obsidian-vault ~/Documents/MyVault

# Override the title and add tags
inksight transform "2024-03-15 Call" \
  --obsidian-vault ~/Documents/MyVault \
  --obsidian-title "Q1 Strategy Call" \
  --obsidian-tags "meeting,q1,strategy"
```

The generated file looks like:

```markdown
---
title: Q1 Strategy Call
date: 2024-03-15
tags:
  - meeting
  - q1
  - strategy
source: remarkable
---

Your transformed note content here…
```

**Filename rules:**
- Title is sanitized and used as the filename (`Q1 Strategy Call.md`).
- If no title is available, the date is used (`2024-03-15.md`).
- If a file with the same name already exists, a timestamp suffix is appended
  (`Q1 Strategy Call 2024-03-15T14-30-00.md`).

`--obsidian-vault` can be used alongside `--type`, `--page`, and all other
`transform` flags.

### Use as a library

```typescript
import { InkSightClient } from 'inksight';

const client = new InkSightClient({ /* config */ });
await client.connect();

const docs = await client.listDocuments();
const result = await client.transform(docs[0], { type: 'htr' });
console.log(result.text);
```

---

## Requirements

- Node.js >= 18
- reMarkable Paper Pro (or reMarkable 2)
- reMarkable Cloud account **or** SSH access to your device
- OpenAI or Anthropic API key

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design.

```
inksight/
├── src/
│   ├── cloud/          # reMarkable Cloud API client
│   ├── device/         # SSH/USB direct device access
│   ├── renderer/       # .rm file parser + PNG renderer
│   ├── ai/             # Multi-provider AI (OpenAI, Anthropic)
│   ├── storage/        # SQLite cache & document index
│   ├── performance/    # Parallel processing & batch AI
│   └── cli/            # Interactive CLI
└── tests/
```

---

## Development

```bash
git clone https://github.com/talosgunn/inksight.git
cd inksight
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run tests (642 tests, ~4s)
npm test

# Lint / format
npm run lint
npm run format
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Issues and PRs welcome.

---

## License

MIT — see [LICENSE](./LICENSE).
