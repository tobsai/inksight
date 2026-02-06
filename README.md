# InkSight

AI-powered ink transformation for reMarkable Paper Pro

## Overview

InkSight transforms your reMarkable handwritten notes and drawings through AI, offering capabilities like:
- **Text Recognition**: Convert handwriting to editable text
- **Diagram Cleanup**: Clean up and vectorize hand-drawn diagrams
- **Content Summarization**: Generate summaries of lengthy notes
- **Smart Search**: Make handwritten content searchable
- **Intelligent Formatting**: Auto-format notes with proper structure

## Status

🚧 **Early Development** - Project scaffolding phase

## Prerequisites

- Node.js >= 18.0.0
- TypeScript 5.x
- reMarkable Paper Pro (or reMarkable 2)
- reMarkable Cloud account OR SSH access to device

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Fill in your credentials:
- **reMarkable Cloud API**: Get tokens from [my.remarkable.com](https://my.remarkable.com)
- **AI Services**: OpenAI or Anthropic API keys
- **SSH Access** (optional): For direct device access

## Usage

Coming soon! See [ROADMAP.md](./ROADMAP.md) for development plan.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system design.

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm run test

# Lint
npm run lint

# Format
npm run format
```

## Project Structure

```
inksight/
├── src/
│   ├── cloud/          # reMarkable Cloud API client
│   ├── device/         # Direct device access (SSH/USB)
│   ├── parser/         # .rm file format parser
│   ├── ai/             # AI transformation modules
│   ├── transformers/   # Specific transformation implementations
│   ├── storage/        # Local cache and storage
│   └── index.ts        # Main entry point
├── docs/               # Additional documentation
├── tests/              # Test files
└── examples/           # Usage examples
```

## Contributing

Contributions welcome! Please read the architecture docs first to understand the system design.

## License

MIT

## Resources

### reMarkable Documentation
- [reMarkable Cloud API](https://github.com/splitbrain/ReMarkableAPI/wiki)
- [File Format Specs](https://github.com/ax3l/lines-are-beautiful)
- [Awesome reMarkable](https://github.com/reHackable/awesome-reMarkable)

### Related Projects
- [rmapi](https://github.com/ddvk/rmapi) - Go API for reMarkable Cloud
- [lines-are-beautiful](https://github.com/ax3l/lines-are-beautiful) - C++ file API
- [rmrl](https://github.com/rschroll/rmrl) - Python rendering library
