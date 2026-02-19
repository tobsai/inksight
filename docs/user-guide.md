# InkSight User Guide

> AI-powered ink transformation for reMarkable Paper Pro

---

## Table of Contents

1. [Installation](#installation)
2. [Quick Start (5 minutes)](#quick-start)
3. [Setup Wizard](#setup-wizard)
4. [Commands](#commands)
5. [Transform Types](#transform-types)
6. [Output Formats](#output-formats)
7. [Presets](#presets)
8. [Export Templates](#export-templates)
9. [Cost Estimates](#cost-estimates)

---

## Installation

### Requirements

- Node.js 18 or later
- npm 8 or later
- A reMarkable Paper Pro device (or reMarkable Cloud account)
- An OpenAI or Anthropic API key

### Install globally

```bash
npm install -g inksight
```

Verify the installation:

```bash
inksight --version
```

---

## Quick Start

Five minutes from install to your first transformed note.

### 1. Run setup

```bash
inksight setup
```

Answer the prompts (see [Setup Wizard](#setup-wizard) for details).

### 2. List your documents

```bash
inksight list
```

This shows your reMarkable documents. Find the ID of the note you want to process.

### 3. Transform a document

```bash
inksight transform <documentId> --type text
```

That's it! The extracted text is printed to the terminal and saved to `~/inksight-output/`.

---

## Setup Wizard

Running `inksight setup` launches an interactive wizard:

```
? How do you connect to your reMarkable device?
  ❯ Hybrid  — try SSH first, fall back to Cloud (recommended)
    Cloud   — reMarkable cloud API only
    SSH     — direct device connection only
```

### Step-by-step

| Step | Prompt | Notes |
|------|--------|-------|
| 1 | Connection mode | **Hybrid** recommended — fastest access |
| 2 | Cloud email + password | Only if using cloud or hybrid mode |
| 3 | Device IP, username, SSH key | Only if using SSH or hybrid mode (default IP: `10.11.99.1`) |
| 4 | AI provider | OpenAI (GPT-4o) or Anthropic (Claude Sonnet) |
| 5 | API key | Your provider key |
| 6 | Default transform | `text` / `summary` / `diagram` |

Config is saved to `~/.inksight/config.json`.

> **Security note:** API keys and passwords are stored in plaintext in the config file.
> For production use, prefer environment variables — see the [Config Reference](#configuration).

---

## Commands

### `inksight setup`

Run the interactive setup wizard.

```bash
inksight setup
```

---

### `inksight list`

List your reMarkable documents.

```bash
inksight list
inksight list --limit 50
```

| Option | Default | Description |
|--------|---------|-------------|
| `--limit <n>` | `20` | Max documents to show |

---

### `inksight get <documentId>`

Download a document to local cache.

```bash
inksight get 3fa85f64-5717-4562-b3fc-2c963f66afa6
```

---

### `inksight transform <documentId>`

Transform a document with AI.

```bash
# Extract text (default)
inksight transform <id>

# Generate summary
inksight transform <id> --type summary

# Convert diagram to Mermaid
inksight transform <id> --type diagram

# Extract metadata (tags, people, dates)
inksight transform <id> --type metadata

# Transform a specific page (0-based)
inksight transform <id> --page 2
```

| Option | Default | Description |
|--------|---------|-------------|
| `--type <type>` | `text` | `text`, `diagram`, `summary`, `metadata` |
| `--page <n>` | `0` | Page index to process |

---

### `inksight search <query>`

Full-text search across all processed documents.

```bash
inksight search "project kickoff"
inksight search "Q4 goals" --tag meeting
inksight search "Alice" --limit 5
```

| Option | Default | Description |
|--------|---------|-------------|
| `--tag <tag>` | — | Filter results by tag |
| `--limit <n>` | `10` | Max results |

---

### `inksight batch <pattern>`

Process all documents whose names match a pattern.

```bash
inksight batch "meeting*" --type summary
inksight batch "2024-*" --type text
```

---

### `inksight status`

Show connection status and cost statistics.

```bash
inksight status
```

---

## Transform Types

### `text`

Extracts handwritten text from your notes using vision AI.

- Detects paragraphs, bullet lists, numbered lists, checklists
- Word count and estimated reading time
- Language detection (English, Spanish, French, German, and more)
- Output formats: `plain`, `markdown`, `structured`

**Best for:** Meeting notes, lecture notes, journal entries, study notes.

---

### `summary`

Generates an AI-powered summary of your notes.

- Bullet / paragraph / executive style
- Key point extraction
- Action item detection (`[ ]` and `- [ ]` syntax)
- Multi-page hierarchical summarization

**Best for:** Long notes, multi-page documents, meeting recaps.

---

### `diagram`

Converts hand-drawn sketches into structured diagrams.

- Detects flowcharts, mindmaps, sequence diagrams, ER diagrams
- Exports Mermaid syntax for embedding in Markdown
- Falls back to plain-English description

**Best for:** Process flows, architecture sketches, mind maps.

---

### `metadata`

Extracts structured metadata from your notes.

- Dates (ISO 8601 and natural language)
- Names of people, organizations, and locations
- Topic tags for search
- Action items

**Best for:** Archiving, search indexing, CRM integration.

---

## Output Formats

| Format | Description | Best for |
|--------|-------------|----------|
| `plain` | Clean text, no markup | Copy-paste, terminal reading |
| `markdown` | GitHub-flavored Markdown | Obsidian, Notion, Bear |
| `structured` | Full JSON with all fields | Apps, automation, archiving |

Set the default in `~/.inksight/config.json`:

```json
{
  "transforms": {
    "outputFormat": "markdown"
  }
}
```

Or override per-command:

```bash
INKSIGHT_OUTPUT_FORMAT=plain inksight transform <id>
```

---

## Presets

Presets combine multiple transforms and options for common workflows:

| Preset | Transforms | Best for |
|--------|------------|----------|
| `quick-text` | text | Fast reads, copy-paste |
| `full-analysis` | text + summary + metadata | Deep review |
| `diagram-focus` | diagram | Sketches, flows |
| `meeting-notes` | summary + metadata | Meeting recaps |
| `archive` | all | Long-term storage |

Presets are used programmatically (see [API docs](./api.md)).

---

## Export Templates

When saving results to files, choose a template:

| Template | Extension | Best for |
|----------|-----------|---------|
| `obsidian-note` | `.md` | Obsidian vault with YAML frontmatter |
| `notion-import` | `.md` | Notion page import |
| `plain-text` | `.txt` | Simple text file |
| `json-export` | `.json` | Apps, data pipeline |

---

## Cost Estimates

Costs depend on note length and AI provider. Typical estimates:

| Operation | Pages | Estimated cost |
|-----------|-------|----------------|
| Text extraction | 1 | $0.004–0.012 |
| Text extraction | 10 | $0.04–0.12 |
| Summary (single page) | 1 | $0.005–0.015 |
| Summary (multi-page) | 10 | $0.05–0.15 |
| Diagram | 1 | $0.005–0.015 |
| Metadata | 1 | $0.003–0.010 |
| Full analysis (`archive` preset) | 1 | $0.015–0.05 |

### Cost control

Set `maxCostPerDocument` in config (default: `$0.10`):

```json
{
  "ai": {
    "maxCostPerDocument": 0.05
  }
}
```

Or use the env var:

```bash
INKSIGHT_MAX_COST=0.05 inksight transform <id>
```

---

## Configuration

Config file: `~/.inksight/config.json`

See all available keys in the [API docs — ConfigManager](./api.md#configmanager).

### Environment Variable Reference

| Variable | Description |
|----------|-------------|
| `INKSIGHT_CONNECTION_MODE` | `cloud`, `ssh`, or `hybrid` |
| `INKSIGHT_CLOUD_EMAIL` | reMarkable account email |
| `INKSIGHT_CLOUD_PASSWORD` | reMarkable account password |
| `INKSIGHT_SSH_HOST` | Device IP address |
| `INKSIGHT_SSH_USER` | SSH username |
| `INKSIGHT_SSH_KEY_PATH` | Path to SSH private key |
| `INKSIGHT_SSH_PORT` | SSH port (default: 22) |
| `INKSIGHT_AI_PROVIDER` | `openai`, `anthropic`, or `auto` |
| `INKSIGHT_OPENAI_KEY` | OpenAI API key |
| `INKSIGHT_ANTHROPIC_KEY` | Anthropic API key |
| `INKSIGHT_DEFAULT_MODEL` | Override AI model name |
| `INKSIGHT_MAX_COST` | Max cost per document (USD) |
| `INKSIGHT_TRANSFORM_TYPE` | Default transform type |
| `INKSIGHT_OUTPUT_DIR` | Output directory |
| `INKSIGHT_OUTPUT_FORMAT` | `plain`, `markdown`, `structured` |
| `INKSIGHT_DB_PATH` | SQLite database path |
| `INKSIGHT_CACHE_DIR` | Cache directory |
| `INKSIGHT_MAX_CACHE_MB` | Cache size limit in MB |
