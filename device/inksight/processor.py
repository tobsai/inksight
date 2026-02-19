"""File processor for InkSight — reads .rm v6 files, applies improvements, writes back."""

import io
import logging
import os
import shutil
import time
from pathlib import Path
from typing import List, Optional, Tuple

from rmscene import read_blocks, write_blocks
from rmscene.scene_items import Line, Pen
from rmscene.scene_stream import Block, SceneLineItemBlock

from .config import InkSightConfig
from .smoothing import process_stroke

logger = logging.getLogger("inksight.processor")

# Marker file suffix to track processed files
PROCESSED_MARKER = ".inksight"


class FileProcessor:
    """Processes .rm files by reading, smoothing strokes, and writing back."""

    def __init__(self, config: InkSightConfig):
        self.config = config
        self._processed_mtimes: dict[str, float] = {}

    def should_process(self, rm_path: str) -> bool:
        """Check if an .rm file needs processing."""
        if not rm_path.endswith(".rm"):
            return False

        try:
            mtime = os.path.getmtime(rm_path)
        except OSError:
            return False

        # Skip if we already processed this version
        last_mtime = self._processed_mtimes.get(rm_path)
        if last_mtime is not None and mtime <= last_mtime:
            return False

        # Check for our marker file — if it exists with same mtime, skip
        marker = rm_path + PROCESSED_MARKER
        if os.path.isfile(marker):
            try:
                marker_content = Path(marker).read_text().strip()
                if marker_content == str(mtime):
                    self._processed_mtimes[rm_path] = mtime
                    return False
            except OSError:
                pass

        return True

    def _should_process_line(self, line: Line) -> bool:
        """Check if a line/stroke should be processed based on tool type."""
        skip = self.config.processing.skip_tools
        only = self.config.processing.only_tools

        tool_id = int(line.tool)

        if tool_id in skip:
            return False

        if only and tool_id not in only:
            return False

        return True

    def process_file(self, rm_path: str) -> bool:
        """Process a single .rm file. Returns True if changes were made."""
        logger.info("Processing %s", rm_path)

        try:
            # Read the file
            with open(rm_path, "rb") as f:
                blocks = list(read_blocks(f))
        except Exception as e:
            logger.error("Failed to read %s: %s", rm_path, e)
            return False

        # Track if we made any changes
        modified = False
        lines_processed = 0
        lines_skipped = 0

        for block in blocks:
            if not isinstance(block, SceneLineItemBlock):
                continue

            item = block.item
            if item.value is None:
                continue

            line: Line = item.value
            if not self._should_process_line(line):
                lines_skipped += 1
                continue

            if len(line.points) < 2:
                lines_skipped += 1
                continue

            # Apply smoothing pipeline
            original_points = line.points
            new_points = process_stroke(original_points, self.config)

            # Check if anything actually changed
            if new_points != original_points:
                line.points = new_points
                modified = True
                lines_processed += 1
            else:
                lines_skipped += 1

        if modified:
            # Write back
            try:
                self._write_safely(rm_path, blocks)
                logger.info(
                    "Processed %s: %d lines smoothed, %d skipped",
                    rm_path, lines_processed, lines_skipped,
                )
            except Exception as e:
                logger.error("Failed to write %s: %s", rm_path, e)
                return False
        else:
            logger.debug("No changes needed for %s (%d lines checked)", rm_path, lines_skipped)

        # Mark as processed
        mtime = os.path.getmtime(rm_path)
        self._mark_processed(rm_path, mtime)
        return modified

    def _write_safely(self, rm_path: str, blocks: List[Block]):
        """Write blocks back to file with atomic rename for safety."""
        tmp_path = rm_path + ".inksight_tmp"
        backup_path = rm_path + ".inksight_bak"

        try:
            # Write to temp file
            with open(tmp_path, "wb") as f:
                write_blocks(f, blocks)

            # Backup original
            shutil.copy2(rm_path, backup_path)

            # Atomic rename
            os.rename(tmp_path, rm_path)

            # Remove backup on success (keep backups if you want safety)
            # os.remove(backup_path)

        except Exception:
            # Clean up temp file on failure
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            raise

    def _mark_processed(self, rm_path: str, mtime: float):
        """Write a marker file to avoid reprocessing."""
        self._processed_mtimes[rm_path] = mtime
        marker = rm_path + PROCESSED_MARKER
        try:
            Path(marker).write_text(str(mtime))
        except OSError as e:
            logger.warning("Could not write marker %s: %s", marker, e)
