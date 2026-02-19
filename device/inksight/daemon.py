"""InkSight daemon — entry point for the on-device service."""

import argparse
import logging
import logging.handlers
import os
import signal
import sys
from pathlib import Path

from .config import InkSightConfig
from .watcher import FileWatcher


def setup_logging(config: InkSightConfig):
    """Configure logging with file rotation."""
    log_dir = os.path.dirname(config.logging.file)
    if log_dir:
        os.makedirs(log_dir, exist_ok=True)

    root_logger = logging.getLogger("inksight")
    root_logger.setLevel(getattr(logging, config.logging.level.upper(), logging.INFO))

    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # File handler with rotation
    file_handler = logging.handlers.RotatingFileHandler(
        config.logging.file,
        maxBytes=config.logging.max_size_mb * 1024 * 1024,
        backupCount=config.logging.backup_count,
    )
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)

    # Console handler (always, useful for foreground mode and systemd)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)


def write_pid(pid_file: str):
    """Write PID file."""
    os.makedirs(os.path.dirname(pid_file), exist_ok=True)
    Path(pid_file).write_text(str(os.getpid()))


def remove_pid(pid_file: str):
    """Remove PID file."""
    try:
        os.remove(pid_file)
    except OSError:
        pass


def main():
    parser = argparse.ArgumentParser(
        description="InkSight - On-device handwriting improvement for reMarkable",
    )
    parser.add_argument(
        "-c", "--config",
        help="Path to config file",
        default=None,
    )
    parser.add_argument(
        "-f", "--foreground",
        help="Run in foreground (don't daemonize)",
        action="store_true",
    )
    parser.add_argument(
        "--scan-once",
        help="Scan once and exit (useful for testing)",
        action="store_true",
    )
    parser.add_argument(
        "--xochitl-dir",
        help="Override xochitl directory",
        default=None,
    )
    args = parser.parse_args()

    # Load config
    config = InkSightConfig.load(args.config)

    if args.foreground:
        config.daemon.foreground = True
    if args.xochitl_dir:
        config.xochitl_dir = args.xochitl_dir

    # Set up logging
    setup_logging(config)
    logger = logging.getLogger("inksight.daemon")
    logger.info("InkSight v0.1.0 starting")
    logger.info("Config: xochitl_dir=%s, poll=%.1fs, idle=%.1fs",
                config.xochitl_dir, config.poll_interval, config.idle_threshold)
    logger.info("Smoothing: algorithm=%s, window=%d, enabled=%s",
                config.smoothing.algorithm, config.smoothing.window_size,
                config.smoothing.enabled)

    # Write PID
    write_pid(config.daemon.pid_file)

    # Signal handlers
    running = True

    def handle_signal(signum, frame):
        nonlocal running
        logger.info("Received signal %d, shutting down", signum)
        running = False

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    # Create watcher
    watcher = FileWatcher(config)

    if args.scan_once:
        count = watcher.scan_once()
        logger.info("Scan complete: %d files processed", count)
        remove_pid(config.daemon.pid_file)
        return

    # Run the main loop
    try:
        logger.info("Entering main loop")
        import time
        while running:
            try:
                watcher.scan_once()
            except Exception as e:
                logger.error("Error in scan cycle: %s", e, exc_info=True)
            time.sleep(config.poll_interval)
    except KeyboardInterrupt:
        logger.info("Interrupted")
    finally:
        remove_pid(config.daemon.pid_file)
        logger.info("InkSight stopped")


if __name__ == "__main__":
    main()
