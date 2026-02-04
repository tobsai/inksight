# Ghostwriter Pro Research Notes

*Research conducted: February 3-4, 2026*

## Overview

This document contains research findings for creating a modern "ghostwriter" application for the reMarkable Paper Pro tablet. The concept of "ghostwriter" in the reMarkable community refers to typewriter-style text input functionality that allows users to type on the e-ink display using an external keyboard.

## Original Ghostwriter Context

The original `reHackable/ghostwriter` repository no longer exists on GitHub. However, the concept has been implemented in several community projects:

### Related Projects

1. **Crazy Cow** (`machinelevel/sp425-crazy-cow`)
   - Typewriter input directly into the native reMarkable UI
   - 40KB extension that mimics stylus motion from keyboard input
   - Works with built-in text recognition
   - Features: word-wrapping, basic backspace, font size adjustment
   - **Status**: rM1 only, not tested on rM2 or Paper Pro

2. **remarkable-keywriter** (`dps/remarkable-keywriter`)
   - Full-screen markdown editor inspired by Freewrite
   - Content-only UI with edit/read modes
   - Sundown markdown renderer built-in
   - Ctrl-K quick note switcher
   - Available in Toltec package manager
   - **Status**: rM1/rM2, not Paper Pro compatible

3. **libremarkable** (`canselcik/libremarkable`)
   - Rust framework for rM1/rM2
   - Low-level framebuffer and input handling
   - Native refresh support
   - **Status**: rM1/rM2 only, uses older toolchain

4. **rmkit** (`rmkit-dev/rmkit`)
   - C++ framework for rM apps
   - Second public framework after libremarkable
   - Also supports some Kobo devices
   - **Status**: rM1/rM2, no Paper Pro support

## reMarkable Paper Pro Specifications

### Hardware Code Names
- **chiappa**: reMarkable Paper Pro
- **ferrari**: reMarkable Paper Pro Move
- **rm2**: reMarkable 2
- **rm1**: reMarkable 1

### Key Differences from rM1/rM2
1. **Secure Boot**: Paper Pro uses secure boot (disabled in dev mode)
2. **Developer Mode**: Required to access device via SSH
3. **Disk Encryption**: Enabled by default, Xochitl required at boot
4. **Different SoC**: Uses i.MX processor (see linux-imx-rm kernel)
5. **Color Display**: Gallery 3 color e-ink display capability
6. **New Framebuffer Architecture**: Different from rM2's workarounds

### Developer Mode
- Enable via: Settings > General > Paper Tablet > Software > Advanced > Developer Mode
- Requires factory reset (back up data first!)
- Shows warning on every boot
- SSH access via USB (10.11.99.1) or WiFi (with enablement)
- Root partition is read-only by default (use rw script temporarily)

## Official Development Resources

### reMarkable Developer Portal
- URL: https://developer.remarkable.com
- Official documentation and SDK downloads
- Qt Quick application examples

### Software Stack
- **OS**: reMarkable OS (Codex) - custom Linux distribution
- **Build System**: Yocto Project
- **UI Framework**: Qt Quick (Qt framework)
- **Main Application**: Xochitl (proprietary, not open source)

### SDK Information
- Cross-compilation toolchain for ARM
- Host architecture: x86_64 (Linux required)
- Includes shared libraries and headers
- SDK for each OS version and product

**Latest SDKs (3.24.2.0)**:
- chiappa: `remarkable-production-image-5.4.107-chiappa-public-x86_64-toolchain.sh`
- ferrari: `remarkable-production-image-5.4.107-ferrari-public-x86_64-toolchain.sh`

### Public Source Code
- Linux kernel (Paper Pro): https://github.com/reMarkable/linux-imx-rm
- U-Boot (Paper Pro): https://github.com/reMarkable/uboot-imx-rm
- Examples: https://github.com/reMarkable/remarkable-developer-examples
- ePaper QPA: https://github.com/reMarkable/epaper-qpa

## Input Handling

### Device Input
All devices exposed via Linux Input Subsystem:
- Wacom digitizer (pen)
- Multitouch layer
- Physical buttons
- USB keyboard support
- Folio keyboard (rM2 only currently)

### Libraries for Input
- libevdev (C)
- evdev crate (Rust)
- python-evdev
- node-evdev

## Community Resources

1. **remarkable.guide** - Community maintained guide
2. **awesome-reMarkable** - Curated project list
3. **Toltec** - Community package manager
   - ⚠️ Only supports OS 2.6.1.71 to 3.3.2.1666
   - Does NOT support Paper Pro yet
4. **rmkit.dev** - Framework information
5. **Discord** - Community support

## Key Insights for Paper Pro Development

### Challenges
1. No Toltec support yet for Paper Pro
2. Need to use official SDK (not community toolchains)
3. Different display architecture than rM2
4. Existing projects need significant porting work
5. Limited community testing on Paper Pro

### Recommendations
1. Use official Chiappa SDK from developer.remarkable.com
2. Build Qt Quick application following official examples
3. Handle keyboard input via Linux input subsystem
4. Consider both standalone app and Xochitl integration approaches
5. Test with USB keyboard first, then explore Type Folio

### Architecture Decisions
1. **Language**: Qt/C++ or Rust (Qt Quick for UI)
2. **Display**: Use official ePaper QPA plugin
3. **Input**: Direct evdev access for keyboard events
4. **Storage**: Local files in /home/root/ (similar to keywriter)
5. **Distribution**: Manual install initially, Toltec when supported

## Files and Directories on Device

```
/home/root/.local/share/remarkable/xochitl/    # Documents
/etc/xochitl.conf                               # Settings (use QSettings API)
/usr/share/remarkable/                          # System resources
```

## Next Steps

1. Set up development environment with Chiappa SDK
2. Create basic Qt Quick application structure
3. Implement keyboard event handling
4. Create text rendering on e-ink display
5. Add markdown support
6. Implement file management
7. Test and optimize for e-ink refresh
