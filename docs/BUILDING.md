# Building Ghostwriter Pro

This document provides detailed instructions for building Ghostwriter Pro from source.

## Requirements

### Host System

- **Operating System**: Linux (Ubuntu 20.04+ recommended)
- **Architecture**: x86_64
- **Disk Space**: ~5GB for SDK, ~100MB for project
- **RAM**: 4GB minimum

### Software

- Git
- wget or curl
- Standard build tools (gcc, make)
- Qt development tools (for running qmake)

## Step 1: Download the SDK

The reMarkable Chiappa SDK is required for cross-compilation.

### Find Your OS Version

On your Paper Pro, check your software version:
```
Settings > General > About > Software version
```

### Download Matching SDK

Visit https://developer.remarkable.com/links and download the SDK matching your OS version.

Example for OS 3.24.2.0:
```bash
wget https://storage.googleapis.com/remarkable-codex-toolchain/3.24.2.0/chiappa/remarkable-production-image-5.4.107-chiappa-public-x86_64-toolchain.sh
```

### Install the SDK

```bash
chmod +x remarkable-production-image-*.sh
./remarkable-production-image-*.sh

# Follow prompts, default install location: /opt/remarkable/
```

## Step 2: Clone the Repository

```bash
git clone https://github.com/tobsai/ghostwriter-pro.git
cd ghostwriter-pro
```

## Step 3: Set Up Build Environment

Source the SDK environment:
```bash
# Adjust version number as needed
source /opt/remarkable/5.4.107/environment-setup-cortexa53-crypto-remarkable-linux
```

Verify the cross-compiler is available:
```bash
$CC --version
# Should show arm-remarkable-linux-gnueabi-gcc
```

## Step 4: Build

### Using qmake

```bash
mkdir build
cd build
qmake ..
make
```

### Build Options

To enable device-specific features:
```bash
qmake CONFIG+=chiappa ..
```

## Step 5: Deploy to Device

### Prerequisites

1. Enable Developer Mode on your Paper Pro
2. Connect via USB cable
3. Note your device's SSH password from Settings > Help > About > Copyrights and Licenses

### Copy Binary

```bash
scp ghostwriter-pro root@10.11.99.1:/home/root/
```

### Test Run

```bash
# SSH to device
ssh root@10.11.99.1

# Stop Xochitl
systemctl stop xochitl

# Run application
/home/root/ghostwriter-pro

# When done, restart Xochitl
systemctl start xochitl
```

## Troubleshooting

### "qmake not found"

Make sure you've sourced the SDK environment:
```bash
source /opt/remarkable/5.4.107/environment-setup-*
```

### Linker errors about libevdev

Install libevdev development files on your host:
```bash
sudo apt install libevdev-dev
```

For cross-compilation, the SDK should include the library. If not, you may need to build without evdev support for development.

### SSH connection refused

- Verify Developer Mode is enabled
- Check if USB networking is active (10.11.99.1 should be pingable)
- Ensure SSH password is correct

### Application doesn't start

- Check for missing libraries: `ldd /home/root/ghostwriter-pro`
- Run with debug output: `QT_DEBUG_PLUGINS=1 /home/root/ghostwriter-pro`

## Development Build

For testing on your development machine (not on the Paper Pro):

```bash
# Use system Qt instead of SDK
mkdir build-dev
cd build-dev
/usr/lib/qt5/bin/qmake ..
make
./ghostwriter-pro
```

Note: Development builds won't have evdev keyboard handling.

## CI/CD

The project includes a basic CI configuration for automated builds. See `.github/workflows/build.yml` (when created).

## See Also

- [README.md](../README.md) - Project overview
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
- [ROADMAP.md](../ROADMAP.md) - Development roadmap
