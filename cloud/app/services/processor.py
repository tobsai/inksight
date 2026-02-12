"""File processor for InkSight Cloud.

Processes .rm v6 files using smoothing algorithms from the device tier.
"""

import logging
import time
from pathlib import Path
from typing import Any, Dict

from rmscene import read_blocks, write_blocks
from rmscene.scene_items import Line
from rmscene.scene_stream import SceneLineItemBlock

from ..models import Job, JobStatus, ProcessingStats
from ..smoothing import get_preset, process_stroke
from .storage import storage

logger = logging.getLogger("inksight.processor")

# Tool IDs to skip (highlighter, eraser, etc.)
SKIP_TOOLS = {6, 8}


def process_file(job: Job) -> Dict[str, Any]:
    """Process a single .rm file.
    
    Args:
        job: Job containing input file path and processing parameters
        
    Returns:
        Dict with processing results:
        - status: JobStatus
        - output_path: Path to output file (if successful)
        - stats: ProcessingStats (if successful)
        - error: Error message (if failed)
    """
    start_time = time.time()
    
    try:
        input_path = Path(job.input_path)
        if not input_path.exists():
            return {
                "status": JobStatus.FAILED,
                "error": f"Input file not found: {input_path}"
            }
        
        # Get processing preset
        preset = get_preset(job.preset)
        logger.info(f"Processing {input_path} with preset '{preset.name}'")
        
        # Read the .rm file
        try:
            with open(input_path, "rb") as f:
                blocks = list(read_blocks(f))
        except Exception as e:
            logger.error(f"Failed to read {input_path}: {e}")
            return {
                "status": JobStatus.FAILED,
                "error": f"Failed to read .rm file: {e}"
            }
        
        # Process strokes
        stats = ProcessingStats()
        
        for block in blocks:
            if not isinstance(block, SceneLineItemBlock):
                continue
            
            item = block.item
            if item.value is None:
                continue
            
            line: Line = item.value
            
            # Skip certain tools (highlighter, eraser)
            tool_id = int(line.tool)
            if tool_id in SKIP_TOOLS:
                stats.strokes_skipped += 1
                continue
            
            if len(line.points) < 2:
                stats.strokes_skipped += 1
                continue
            
            # Apply smoothing pipeline
            original_points = line.points
            new_points = process_stroke(original_points, preset)
            
            # Check if anything changed
            if new_points != original_points:
                line.points = new_points
                stats.strokes_processed += 1
                
                # Track which transformations were applied
                if preset.smoothing_enabled:
                    stats.strokes_smoothed += 1
                if preset.line_straightening_enabled:
                    # Check if this stroke was straightened
                    # (would need to compare before/after, simplified here)
                    pass
            else:
                stats.strokes_skipped += 1
        
        # Write output file
        try:
            output_bytes = _blocks_to_bytes(blocks)
            output_path = storage.save_output(
                user_id=job.user_id,
                job_id=job.job_id,
                filename=job.input_filename,
                content=output_bytes
            )
        except Exception as e:
            logger.error(f"Failed to write output: {e}")
            return {
                "status": JobStatus.FAILED,
                "error": f"Failed to write output file: {e}"
            }
        
        # Calculate processing time
        processing_time = int((time.time() - start_time) * 1000)
        stats.processing_time_ms = processing_time
        
        logger.info(
            f"Processed {input_path}: {stats.strokes_processed} strokes smoothed, "
            f"{stats.strokes_skipped} skipped in {processing_time}ms"
        )
        
        return {
            "status": JobStatus.COMPLETED,
            "output_path": str(output_path),
            "stats": stats,
        }
    
    except Exception as e:
        logger.error(f"Unexpected error processing {job.input_path}: {e}", exc_info=True)
        return {
            "status": JobStatus.FAILED,
            "error": f"Unexpected error: {e}"
        }


def _blocks_to_bytes(blocks) -> bytes:
    """Convert rmscene blocks back to bytes."""
    from io import BytesIO
    
    output = BytesIO()
    write_blocks(output, blocks)
    return output.getvalue()
