# AI Configuration Guide

This document explains how to configure and use the AI-powered text transformation features in Ghostwriter Pro.

## Overview

Ghostwriter Pro can transform your selected text using AI models from:
- **OpenAI** (GPT-4, GPT-4o, etc.)
- **Anthropic** (Claude Sonnet, Claude Opus, etc.)
- **Ollama** (Self-hosted local models)

All AI processing happens over WiFi - the reMarkable sends your selected text to the AI provider, receives the transformation, and injects it back into your document.

## Quick Start

1. Open Ghostwriter Pro
2. Press `Ctrl+,` to open AI Settings
3. Select your preferred AI provider
4. Enter your API key (or configure Ollama server)
5. Select text with `Shift+Arrow` keys
6. Press `Ctrl+T` to transform

## Provider Setup

### OpenAI

**Requirements:**
- OpenAI API account with credits
- API key from [platform.openai.com](https://platform.openai.com)

**Configuration:**
1. Open AI Settings (`Ctrl+,`)
2. Select "OpenAI"
3. Enter your API key (starts with `sk-`)
4. Optionally change the model:
   - `gpt-4o` (default, fast and capable)
   - `gpt-4` (more capable, slower)
   - `gpt-4o-mini` (fastest, most affordable)
   - `gpt-3.5-turbo` (legacy, very fast)

**Cost:** Pay-per-use based on tokens. Typical transformation: $0.001 - $0.01

### Anthropic (Claude)

**Requirements:**
- Anthropic API account
- API key from [console.anthropic.com](https://console.anthropic.com)

**Configuration:**
1. Open AI Settings (`Ctrl+,`)
2. Select "Anthropic"
3. Enter your API key (starts with `sk-ant-`)
4. Optionally change the model:
   - `claude-sonnet-4-20250514` (default, balanced)
   - `claude-3-5-sonnet-20241022` (previous gen)
   - `claude-3-opus-20240229` (most capable)

**Cost:** Pay-per-use based on tokens. Typical transformation: $0.001 - $0.02

### Ollama (Local/Self-hosted)

**Requirements:**
- A computer/server running Ollama accessible over your network
- Ollama installed from [ollama.ai](https://ollama.ai)
- At least one model downloaded

**Server Setup:**
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Download a model
ollama pull llama3.2

# Start Ollama server (binds to all interfaces)
OLLAMA_HOST=0.0.0.0 ollama serve
```

**Configuration:**
1. Open AI Settings (`Ctrl+,`)
2. Select "Ollama (Local)"
3. Enter your server URL: `http://<server-ip>:11434`
4. Enter your model name: `llama3.2`

**Recommended Models:**
- `llama3.2` - Good balance of speed and capability
- `llama3.1:8b` - Faster, smaller
- `mistral` - Fast and capable
- `codellama` - Better for code-related transformations

**Cost:** Free (runs on your hardware)

## Configuration File

AI settings are stored in `~/ghostwriter/ai-config.json`:

```json
{
  "provider": "anthropic",
  "openaiKey": "sk-...",
  "anthropicKey": "sk-ant-...",
  "ollamaUrl": "http://localhost:11434",
  "ollamaModel": "llama3.2",
  "openaiModel": "gpt-4o",
  "anthropicModel": "claude-sonnet-4-20250514",
  "customPrompts": []
}
```

## Built-in Transformations

### Text Transformations

| Name | What it does |
|------|-------------|
| **Summarize** | Condenses text to ~20-30% of original |
| **Expand** | Adds detail, examples (2-3x length) |
| **Bullet Points** | Converts to structured bullet list |
| **Improve Writing** | Fixes grammar, improves clarity |
| **Simplify** | Makes text easier to understand |
| **Make Formal** | Converts to professional tone |
| **Make Casual** | Converts to friendly tone |
| **Extract Actions** | Pulls out tasks and to-dos |
| **Generate Questions** | Creates discussion questions |

### Diagram Transformations

| Name | Output |
|------|--------|
| **Process Flow** | Mermaid flowchart |
| **Sequence Diagram** | Mermaid sequence diagram |
| **Mind Map** | Mermaid mindmap |

## Mermaid Diagrams

When you use a diagram transformation:

1. The AI generates Mermaid diagram code
2. Ghostwriter sends the code to [mermaid.ink](https://mermaid.ink) for rendering
3. The SVG/PNG is downloaded and cached locally
4. The diagram displays on your screen
5. Both the image and code are available for insertion

**Offline Behavior:**
If WiFi is unavailable, diagrams are converted to a text representation:

```
=== Flowchart ===

Steps:
  • Start
  • Process Data
  • Decision Point
  • End

Flow:
  Start → Process Data
  Process Data → Decision Point
  Decision Point -[yes]→ End
```

**Diagram Cache:**
Rendered diagrams are cached in `~/ghostwriter/mermaid-cache/` to avoid re-rendering the same diagram.

## Custom Prompts

You can enter any custom prompt for transformation:

1. Select text with `Shift+Arrow`
2. Press `Ctrl+T`
3. Scroll to "Custom Prompt" or type in the text box
4. Enter your instructions, e.g.:
   - "Translate to Spanish"
   - "Convert to haiku"
   - "Make this sound like a pirate"
   - "Add emoji to each sentence"
   - "Format as a recipe"

## Tips for Best Results

1. **Be specific** - Clear prompts get better results
2. **Select enough context** - AI works better with complete thoughts
3. **Check the result** - Always review AI output before accepting
4. **Use the right model** - Larger models are better for complex tasks
5. **Mind the length** - Very long selections may be truncated

## Keyboard Reference

| Shortcut | Action |
|----------|--------|
| `Shift+←/→/↑/↓` | Extend selection |
| `Shift+Home/End` | Select to line start/end |
| `Ctrl+A` | Select all |
| `Ctrl+T` | Open AI Transform palette |
| `Ctrl+,` | Open AI Settings |
| `Escape` | Cancel / clear selection |

## Troubleshooting

**"AI not configured"**
- Open AI Settings and set up a provider with API key

**"Network error"**
- Check WiFi connection
- Verify API endpoint is reachable
- Check firewall settings

**"Invalid API key"**
- Verify key is entered correctly
- Check key hasn't expired
- Ensure account has credits

**"Model not found" (Ollama)**
- Run `ollama pull <model>` on server
- Check model name spelling

**Diagrams not rendering**
- Check internet connection
- mermaid.ink may be temporarily unavailable
- Check `~/ghostwriter/mermaid-cache/` for cached images

## Privacy Considerations

- Selected text is sent to your chosen AI provider
- OpenAI and Anthropic have their own privacy policies
- Ollama keeps everything on your own infrastructure
- No text is stored by Ghostwriter Pro beyond the session

For sensitive documents, consider using Ollama with a local model.
