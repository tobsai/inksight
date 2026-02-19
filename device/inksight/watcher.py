"""File watcher for InkSight — monitors xochitl directory for .rm file changes."""

import json
import logging
import os
import time
from pathlib import Path
from typing import Dict, Optional, Set

from .config import InkSightConfig
from .processor import FileProcessor

logger = logging.getLogger("inksight.watcher")


class CloudQueue:
    """Simple file-based queue for notes ready for cloud processing."""

    def __init__(self, queue_file: str):
        self.queue_file = queue_file
        self._queue: list[dict] = []
        self._load()

    def _load(self):
        try:
            if os.path.isfile(self.queue_file):
                with open(self.queue_file, "r") as f:
                    self._queue = json.load(f)
        except (json.JSONDecodeError, OSError):
            self._queue = []

    def _save(self):
        os.makedirs(os.path.dirname(self.queue_file), exist_ok=True)
        with open(self.queue_file, "w") as f:
            json.dump(self._queue, f, indent=2)

    def enqueue(self, notebook_uuid: str, page_uuid: str, rm_path: str):
        """Add a note to the cloud processing queue."""
        entry = {
            "notebook_uuid": notebook_uuid,
            "page_uuid": page_uuid,
            "rm_path": rm_path,
            "queued_at": time.time(),
            "status": "pending",
        }
        # Don't duplicate
        for existing in self._queue:
            if existing["rm_path"] == rm_path and existing["status"] == "pending":
                return
        self._queue.append(entry)
        self._save()
        logger.info("Queued %s for cloud processing", rm_path)


class FileWatcher:
    """Polls the xochitl directory for modified .rm files.

    Uses polling instead of inotify for maximum compatibility across
    reMarkable firmware versions. The poll interval is configurable.
    """

    def __init__(self, config: InkSightConfig):
        self.config = config
        self.processor = FileProcessor(config)
        self.cloud_queue: Optional[CloudQueue] = None

        if config.cloud.enabled:
            self.cloud_queue = CloudQueue(config.cloud.queue_file)

        # Track file modification times for idle detection
        self._file_mtimes: Dict[str, float] = {}
        self._file_last_change: Dict[str, float] = {}
        self._idle_triggered: Set[str] = set()

    def scan_once(self) -> int:
        """Scan the xochitl directory once and process any changed files.

        Returns the number of files processed.
        """
        xochitl = Path(self.config.xochitl_dir)
        if not xochitl.is_dir():
            logger.warning("xochitl directory not found: %s", xochitl)
            return 0

        processed = 0
        now = time.time()

        # Walk all notebook directories
        for notebook_dir in xochitl.iterdir():
            if not notebook_dir.is_dir():
                continue

            # Look for .rm files within the notebook directory
            for rm_file in notebook_dir.glob("*.rm"):
                rm_path = str(rm_file)

                try:
                    mtime = os.path.getmtime(rm_path)
                except OSError:
                    continue

                # Track modification times
                old_mtime = self._file_mtimes.get(rm_path)
                if old_mtime != mtime:
                    self._file_mtimes[rm_path] = mtime
                    self._file_last_change[rm_path] = now
                    self._idle_triggered.discard(rm_path)

                # Check if file is idle (no changes for idle_threshold seconds)
                last_change = self._file_last_change.get(rm_path)
                if last_change is None:
                    self._file_last_change[rm_path] = now
                    continue

                idle_time = now - last_change
                if idle_time < self.config.idle_threshold:
                    continue  # Still being edited

                # File is idle — process it
                if self.processor.should_process(rm_path):
                    try:
                        if self.processor.process_file(rm_path):
                            processed += 1
                    except Exception as e:
                        logger.error("Error processing %s: %s", rm_path, e, exc_info=True)

                # Queue for cloud if idle and not already queued
                if (self.cloud_queue is not None
                        and rm_path not in self._idle_triggered):
                    self._idle_triggered.add(rm_path)
                    notebook_uuid = notebook_dir.name
                    page_uuid = rm_file.stem
                    self.cloud_queue.enqueue(notebook_uuid, page_uuid, rm_path)

        return processed

    def run(self):
        """Run the file watcher loop indefinitely."""
        logger.info(
            "Starting file watcher on %s (poll every %.1fs, idle threshold %.1fs)",
            self.config.xochitl_dir,
            self.config.poll_interval,
            self.config.idle_threshold,
        )

        while True:
            try:
                count = self.scan_once()
                if count > 0:
                    logger.info("Processed %d files this cycle", count)
            except Exception as e:
                logger.error("Watcher error: %s", e, exc_info=True)

            time.sleep(self.config.poll_interval)
