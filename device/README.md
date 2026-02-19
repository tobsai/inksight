# InkSight On-Device Daemon

Real-time handwriting improvement for the reMarkable Paper Pro. Runs as a lightweight daemon that monitors your notebooks and applies stroke smoothing, line straightening, and pressure normalization.

## What It Does

InkSight watches your `.rm` files for changes and, after a configurable idle period (default 30s), applies:

- **Stroke smoothing** — Reduces hand jitter using Gaussian, moving average, or RDP algorithms
- **Line straightening** — Snaps near-straight strokes to perfectly straight lines (great for diagrams)
- **Pressure normalization** — Evens out pressure variation for consistent-looking strokes

Processing is non-destructive: originals are backed up as `.inksight_bak` files and a marker file prevents re-processing.

## Requirements

- reMarkable Paper Pro with **Developer Mode** enabled
- Python 3.8+ on the device (see installation)
- SSH access to the device

## Quick Install

```bash
# Via USB connection (default IP)
./install.sh 10.11.99.1

# Via WiFi (find IP in Settings > Help > Copyrights and licenses)
./install.sh 192.168.x.x
```

The script will:
1. Copy InkSight to `/home/root/.inksight/`
2. Install Python dependencies
3. Create and enable a systemd service
4. Start the daemon

## Manual Install

```bash
# SSH into your reMarkable
ssh root@10.11.99.1

# Create directory
mkdir -p /home/root/.inksight

# Copy files (from your computer)
scp -r inksight/ root@10.11.99.1:/home/root/.inksight/
scp config.yaml root@10.11.99.1:/home/root/.inksight/
scp requirements.txt root@10.11.99.1:/home/root/.inksight/

# On the device: install deps
pip3 install -r /home/root/.inksight/requirements.txt

# Run in foreground for testing
cd /home/root/.inksight
python3 -m inksight -f

# Or scan once and exit
python3 -m inksight --scan-once
```

## Configuration

Edit `/home/root/.inksight/config.yaml`:

```yaml
# Key settings to tune:
poll_interval: 2.0        # How often to check for changes (seconds)
idle_threshold: 30.0      # Wait this long after last edit before processing

smoothing:
  algorithm: gaussian      # gaussian, moving_average, or rdp
  window_size: 5           # Larger = smoother (must be odd)
  sigma: 1.0              # Gaussian spread

line_straightening:
  straightness_threshold: 15.0  # Max deviation to snap straight (device units)

pressure_normalization:
  target_min: 10
  target_max: 245
```

After editing, restart the service:
```bash
systemctl restart inksight
```

## Managing the Service

```bash
systemctl start inksight     # Start
systemctl stop inksight      # Stop
systemctl restart inksight   # Restart
systemctl status inksight    # Check status
journalctl -u inksight -f    # Follow logs
```

## Resource Usage

InkSight is designed to be lightweight:
- **CPU**: Capped at 25% via systemd, runs at low priority (`nice 15`)
- **Memory**: Capped at 128MB, typically uses ~20-30MB
- **I/O**: Idle scheduling class, only reads/writes when changes detected
- **No interference**: Does not touch the xochitl process or UI

## How It Works

1. **Polling**: Scans `/home/root/.local/share/remarkable/xochitl/` every `poll_interval` seconds
2. **Change detection**: Tracks file modification times; waits for `idle_threshold` seconds of inactivity
3. **Parsing**: Uses [rmscene](https://github.com/ricklupton/rmscene) to read/write the `.rm` v6 binary format
4. **Processing**: Applies smoothing pipeline to each stroke's point array
5. **Safe write**: Writes to temp file, backs up original, then atomic rename

## Uninstall

```bash
ssh root@10.11.99.1 bash -c '
  systemctl stop inksight
  systemctl disable inksight
  rm /etc/systemd/system/inksight.service
  systemctl daemon-reload
  rm -rf /home/root/.inksight
'
```

## Troubleshooting

**"Python not found"**: The reMarkable doesn't ship with Python by default. Options:
- Install [Toltec](https://toltec-dev.org/) package manager (if your firmware is supported)
- Cross-compile Python for ARM and copy it
- Use a static Python build

**Service won't start**: Check `journalctl -u inksight -e` for errors. Common issues:
- Missing Python dependencies (run `pip3 install rmscene pyyaml`)
- Permission issues (daemon runs as root)

**Strokes look wrong after processing**: Adjust `smoothing.window_size` (smaller = less aggressive) or disable specific features in config.

## License

MIT
