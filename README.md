# InkSight

**AI-powered ink transformation for reMarkable Paper Pro** — turn your handwritten notes and drawings into structured, polished content.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform: reMarkable Paper Pro](https://img.shields.io/badge/Platform-reMarkable%20Paper%20Pro-blue.svg)](https://remarkable.com)

## What It Does

You write and draw on your reMarkable Paper Pro like you normally would. InkSight watches the page and uses AI to **transform your ink** into something more:

- 🖊️ **Handwriting → Text** — Convert messy handwriting into clean, editable text
- 📐 **Sketches → Diagrams** — Turn rough flowcharts and wireframes into polished Mermaid/SVG diagrams
- 📝 **Notes → Summaries** — Distill pages of meeting notes into structured key points
- 🗺️ **Ideas → Mind Maps** — Transform brainstormed scribbles into organized mind maps
- 🔄 **Drawings → Clean Art** — Refine rough sketches into cleaner illustrations
- 📊 **Data → Charts** — Interpret hand-drawn tables or figures into proper charts
- 🌐 **Any Language** — Translate handwritten notes between languages
- ✨ **Custom Prompts** — Tell the AI what you want and it transforms your ink accordingly

The core idea: **your pen is the input, AI is the engine, the e-ink screen is the canvas.**

## How It Works

```
   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
   │  You write / │     │  InkSight    │     │  AI returns  │
   │  draw on the │ ──► │  captures &  │ ──► │  transformed │
   │  Paper Pro   │     │  sends to AI │     │  content     │
   └──────────────┘     └──────────────┘     └──────────────┘
```

1. **Capture** — InkSight accesses the current page's ink data (strokes, drawings, handwriting)
2. **Interpret** — Ink is processed via vision AI (image of the page) or stroke data analysis
3. **Transform** — AI applies your chosen transformation (or a custom prompt)
4. **Render** — Results are displayed on the e-ink screen for review, then optionally saved or overlaid

## Target Platform

| Specification | Value |
|--------------|-------|
| Device | reMarkable Paper Pro |
| Codename | Chiappa |
| OS Version | 3.20+ |
| SDK | Official reMarkable SDK |
| Framework | Qt Quick |

> ⚠️ **Paper Pro Only**: This application is designed specifically for the reMarkable Paper Pro. It will NOT work on reMarkable 1 or 2 due to different display architectures and ink data formats.

## AI Providers

InkSight supports multiple AI backends:

| Provider | Models | Use Case |
|----------|--------|----------|
| **OpenAI** | GPT-4o, GPT-4o-mini | Vision + text (recommended for sketches) |
| **Anthropic** | Claude Sonnet, Claude Opus | Strong reasoning, long-form transforms |
| **Ollama** | Any local model | Privacy-first, no cloud, requires WiFi to local server |

### Setup

1. Open InkSight Settings
2. Select your AI provider
3. Enter your API key (or Ollama server URL)
4. Choose a model

For **sketch-to-diagram** transforms, a vision-capable model (GPT-4o, Claude Sonnet) is recommended.

## Installation

### Quick Install (Coming Soon)

```bash
# SSH to your Paper Pro
ssh root@10.11.99.1

# Download and install
wget https://github.com/tobsai/inksight/releases/latest/download/inksight
chmod +x inksight
mv inksight /home/root/
```

### Building from Source

#### Prerequisites

- Linux development machine (x86_64)
- reMarkable Chiappa SDK ([download](https://developer.remarkable.com/links))
- Qt Quick / C++ knowledge

#### Steps

```bash
# 1. Download and install the Chiappa SDK
wget https://storage.googleapis.com/remarkable-codex-toolchain/3.24.2.0/chiappa/remarkable-production-image-5.4.107-chiappa-public-x86_64-toolchain.sh
chmod +x remarkable-production-image-5.4.107-chiappa-public-x86_64-toolchain.sh
./remarkable-production-image-5.4.107-chiappa-public-x86_64-toolchain.sh

# 2. Clone this repo
git clone https://github.com/tobsai/inksight.git
cd inksight

# 3. Source the SDK environment
source /opt/remarkable/5.4.107/environment-setup-cortexa53-crypto-remarkable-linux

# 4. Build
mkdir build && cd build
qmake ..
make

# 5. Deploy to device
scp inksight root@10.11.99.1:/home/root/
```

## Usage

1. SSH into your Paper Pro and stop the default UI:
   ```bash
   ssh root@10.11.99.1
   systemctl stop xochitl
   ```
2. Run InkSight:
   ```bash
   /home/root/inksight
   ```
3. **Write or draw** on the screen with your stylus as you normally would
4. **Trigger a transformation**:
   - Tap the transform button, or
   - Use a gesture (e.g., double-tap margin), or
   - Connect a keyboard and press `Ctrl+T`
5. **Select a transformation** from the palette (or enter a custom prompt)
6. **Review the result** — accept, reject, or iterate
7. When done, restart the default UI:
   ```bash
   systemctl start xochitl
   ```

### Transformation Palette

| Transform | Description |
|-----------|-------------|
| 📝 **Transcribe** | Convert handwriting to clean text |
| 🔄 **Process Flow** | Turn sketched flowcharts into Mermaid diagrams |
| 📊 **Sequence Diagram** | Interpret interaction sketches as sequence diagrams |
| 🧠 **Mind Map** | Organize scattered ideas into a mind map |
| 📋 **Summarize** | Distill notes into key points |
| 📖 **Expand** | Flesh out abbreviated notes into full prose |
| ✏️ **Clean Up** | Refine rough drawings into cleaner versions |
| 🌐 **Translate** | Translate handwritten text to another language |
| • **Bullet Points** | Structure notes into organized lists |
| ☑️ **Extract Actions** | Pull out action items and todos |
| ❓ **Generate Questions** | Create discussion questions from notes |
| 💬 **Custom** | Enter your own transformation prompt |

### Keyboard Shortcuts (Optional)

If you connect a USB keyboard via USB-C OTG:

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | Open transformation palette |
| `Ctrl+,` | AI settings |
| `Ctrl+S` | Save current page |
| `Ctrl+Z` | Undo last transform |
| `Escape` | Cancel / dismiss |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                       InkSight                          │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │  Ink Capture │  │  AI Engine  │  │  Result Render  │ │
│  │  (strokes,  │  │  (vision,   │  │  (text, images, │ │
│  │   page img) │  │   prompts)  │  │   diagrams)     │ │
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘ │
│         │                │                   │          │
│  ┌──────┴────────────────┴───────────────────┴───────┐  │
│  │              Application Framework                 │  │
│  └──────┬────────────────┬───────────────────┬───────┘  │
│         │                │                   │          │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌────────┴────────┐ │
│  │   Display   │  │   Input     │  │     Storage     │ │
│  │  (ePaper)   │  │ (pen/touch) │  │  (filesystem)   │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                   Linux / Codex OS                       │
└─────────────────────────────────────────────────────────┘
```

### Components

- **Ink Capture**: Reads pen strokes from the Wacom digitizer and/or captures page screenshots for vision AI
- **AI Engine**: Multi-provider client (OpenAI, Anthropic, Ollama) handling vision and text prompts
- **Result Renderer**: Displays transformed content — text, rendered Mermaid diagrams, cleaned images
- **Display**: ePaper-optimized rendering via Qt's ePaper QPA plugin
- **Input**: Pen and touch via Linux input subsystem; optional USB keyboard support
- **Storage**: Local file storage for transformed outputs and settings

## Project Structure

```
inksight/
├── README.md
├── LICENSE
├── RESEARCH.md            # Research notes and background
├── ROADMAP.md             # Development roadmap
├── .gitignore
├── inksight.pro           # Qt project file
├── src/
│   ├── main.cpp           # Application entry point
│   ├── inkcapture.cpp     # Ink/stroke data capture
│   ├── inkcapture.h
│   ├── aiengine.cpp       # AI provider client
│   ├── aiengine.h
│   ├── transform.cpp      # Transformation orchestration
│   ├── transform.h
│   ├── renderer.cpp       # Result rendering (text, images, diagrams)
│   └── renderer.h
├── qml/
│   ├── main.qml           # Main canvas view
│   ├── TransformPalette.qml  # Transformation picker
│   ├── ResultView.qml     # Transform result display
│   └── Settings.qml       # AI provider settings
├── resources/
│   ├── fonts/
│   └── icons/
└── docs/
    ├── BUILDING.md
    └── CONTRIBUTING.md
```

## Inspiration & Acknowledgments

This project was inspired by the original **[reHackable/ghostwriter](https://github.com/reHackable/ghostwriter)** project and the broader reMarkable community's work on extending the device beyond its default capabilities. The ghostwriter concept — making the reMarkable a more active creative tool — planted the seed for InkSight's vision of AI-powered ink transformation.

Additional inspiration from:
- [remarkable-keywriter](https://github.com/dps/remarkable-keywriter) — Keyboard notes app for rM1/rM2
- [Crazy Cow](https://github.com/machinelevel/sp425-crazy-cow) — Typewriter input for rM1
- [libremarkable](https://github.com/canselcik/libremarkable) — Rust framework for rM
- [rmkit](https://rmkit.dev/) — C++ framework for rM
- The reMarkable community on Discord and Reddit
- Contributors to [awesome-reMarkable](https://github.com/reHackable/awesome-reMarkable)

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

## License

MIT License — see [LICENSE](LICENSE) for details.

## Disclaimer

This is an unofficial, community project. It is not affiliated with, endorsed by, or supported by reMarkable AS.

> ⚠️ **Warning**: Modifying your reMarkable Paper Pro with custom software may void your warranty. Use at your own risk.
