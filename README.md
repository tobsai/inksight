# Ghostwriter Pro

A modern, distraction-free typewriter application for the **reMarkable Paper Pro** tablet.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform: reMarkable Paper Pro](https://img.shields.io/badge/Platform-reMarkable%20Paper%20Pro-blue.svg)](https://remarkable.com)

## Overview

Ghostwriter Pro brings typewriter-style text input to the reMarkable Paper Pro, allowing you to connect an external USB keyboard and compose text directly on the e-ink display. Inspired by the original community ghostwriter projects and devices like the Freewrite, this application provides a focused, distraction-free writing experience.

### Features (Planned)

- 📝 **Full-screen text editor** - Clean, minimal interface optimized for e-ink
- ⌨️ **USB keyboard support** - Connect any USB keyboard via USB-C OTG
- 📄 **Markdown support** - Write in markdown, preview rendered output
- 🔤 **Multiple fonts & sizes** - Choose your preferred writing style
- 💾 **Local file storage** - Files saved directly on device
- 🔄 **Word wrapping** - Automatic text flow
- ⏪ **Undo/Redo** - Full edit history
- 🌙 **E-ink optimized** - Minimal refresh, battery efficient

## Target Platform

| Specification | Value |
|--------------|-------|
| Device | reMarkable Paper Pro |
| Codename | Chiappa |
| OS Version | 3.20+ |
| SDK | Official reMarkable SDK |
| Framework | Qt Quick |

> ⚠️ **Paper Pro Only**: This application is designed specifically for the reMarkable Paper Pro. It will NOT work on reMarkable 1 or 2 due to different display architectures.

## Prerequisites

### For Users

1. reMarkable Paper Pro with Developer Mode enabled
2. USB keyboard with USB-C OTG adapter
3. SSH access to your device

### For Developers

1. Linux development machine (x86_64)
2. reMarkable Chiappa SDK (see [Installation](#developer-setup))
3. Qt 5.x knowledge
4. Basic familiarity with cross-compilation

## Installation

### Quick Install (Coming Soon)

```bash
# SSH to your Paper Pro
ssh root@10.11.99.1

# Download and install
wget https://github.com/tobsai/ghostwriter-pro/releases/latest/download/ghostwriter-pro
chmod +x ghostwriter-pro
mv ghostwriter-pro /home/root/
```

### Building from Source

See [Developer Setup](#developer-setup) below.

## Usage

1. Connect a USB keyboard to your Paper Pro using a USB-C OTG adapter
2. SSH into your device and stop Xochitl:
   ```bash
   ssh root@10.11.99.1
   systemctl stop xochitl
   ```
3. Run Ghostwriter Pro:
   ```bash
   /home/root/ghostwriter-pro
   ```
4. Start typing! Your text will appear on screen.
5. When done, restart Xochitl:
   ```bash
   systemctl start xochitl
   ```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save current document |
| `Ctrl+O` | Open document picker |
| `Ctrl+N` | New document |
| `Ctrl+K` | Quick switcher |
| `Escape` | Toggle edit/preview mode |
| `Ctrl++` | Increase font size |
| `Ctrl+-` | Decrease font size |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Ghostwriter Pro                       │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │   Qt Quick  │  │   Editor    │  │   File Manager  │  │
│  │     UI      │  │    Core     │  │                 │  │
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │
│         │                │                   │          │
│  ┌──────┴────────────────┴───────────────────┴───────┐  │
│  │              Application Framework                 │  │
│  └──────┬────────────────┬───────────────────┬───────┘  │
│         │                │                   │          │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌────────┴────────┐  │
│  │   Display   │  │   Input     │  │     Storage     │  │
│  │  (ePaper)   │  │  (evdev)    │  │   (filesystem)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────┤
│                   Linux / Codex OS                       │
└─────────────────────────────────────────────────────────┘
```

### Components

- **Qt Quick UI**: Full-screen QML interface optimized for e-ink
- **Editor Core**: Text editing engine with undo/redo support
- **File Manager**: Local file operations and document management
- **Display**: ePaper-optimized rendering via Qt's ePaper QPA
- **Input**: Direct keyboard event handling via Linux evdev
- **Storage**: Simple file-based storage in user home directory

## Developer Setup

### 1. Download the SDK

Visit https://developer.remarkable.com/links and download the Chiappa SDK matching your target OS version.

```bash
# Example for OS 3.24.2.0
wget https://storage.googleapis.com/remarkable-codex-toolchain/3.24.2.0/chiappa/remarkable-production-image-5.4.107-chiappa-public-x86_64-toolchain.sh
chmod +x remarkable-production-image-5.4.107-chiappa-public-x86_64-toolchain.sh
./remarkable-production-image-5.4.107-chiappa-public-x86_64-toolchain.sh
```

### 2. Clone this Repository

```bash
git clone https://github.com/tobsai/ghostwriter-pro.git
cd ghostwriter-pro
```

### 3. Set up Build Environment

```bash
# Source the SDK environment (adjust path as needed)
source /opt/remarkable/5.4.107/environment-setup-cortexa53-crypto-remarkable-linux

# Verify cross-compiler is available
$CC --version
```

### 4. Build

```bash
mkdir build && cd build
qmake ..
make
```

### 5. Deploy to Device

```bash
scp ghostwriter-pro root@10.11.99.1:/home/root/
```

## Project Structure

```
ghostwriter-pro/
├── README.md              # This file
├── LICENSE                # MIT License
├── RESEARCH.md            # Research notes and background
├── ROADMAP.md             # Development roadmap
├── .gitignore
├── ghostwriter-pro.pro    # Qt project file
├── src/
│   ├── main.cpp           # Application entry point
│   ├── editor.cpp         # Editor core implementation
│   ├── editor.h
│   ├── filemanager.cpp    # File operations
│   ├── filemanager.h
│   └── inputhandler.cpp   # Keyboard input handling
│   └── inputhandler.h
├── qml/
│   ├── main.qml           # Main window
│   ├── Editor.qml         # Editor component
│   ├── FilePicker.qml     # File picker dialog
│   └── QuickSwitcher.qml  # Ctrl+K switcher
├── resources/
│   ├── fonts/             # Bundled fonts
│   └── icons/             # UI icons
└── docs/
    ├── BUILDING.md        # Detailed build instructions
    └── CONTRIBUTING.md    # Contribution guidelines
```

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the detailed development plan.

### Phase 1: Foundation ✨
- [ ] Basic Qt Quick application structure
- [ ] Keyboard input capture
- [ ] Simple text display on screen
- [ ] File save/load

### Phase 2: Editor ✍️
- [ ] Full text editing capabilities
- [ ] Undo/redo support
- [ ] Word wrapping
- [ ] Font size controls

### Phase 3: Features 🚀
- [ ] Markdown rendering
- [ ] Document picker UI
- [ ] Quick switcher
- [ ] Settings persistence

### Phase 4: Polish 💅
- [ ] E-ink optimization
- [ ] Battery efficiency
- [ ] Error handling
- [ ] User documentation

## Related Projects

This project draws inspiration from:

- [remarkable-keywriter](https://github.com/dps/remarkable-keywriter) - Keyboard notes app for rM1/rM2
- [Crazy Cow](https://github.com/machinelevel/sp425-crazy-cow) - Typewriter input for rM1
- [libremarkable](https://github.com/canselcik/libremarkable) - Rust framework for rM
- [rmkit](https://rmkit.dev/) - C++ framework for rM

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This is an unofficial, community project. It is not affiliated with, endorsed by, or supported by reMarkable AS.

> ⚠️ **Warning**: Modifying your reMarkable Paper Pro with custom software may void your warranty. Use at your own risk. The authors are not responsible for any damage to your device.

## Acknowledgments

- The reMarkable community on Discord and Reddit
- Contributors to awesome-reMarkable
- reMarkable for providing developer documentation and SDKs
