"""Transform endpoint - upload and process .rm files."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from ..auth import get_user_id_from_key, verify_api_key
from ..config import settings
from ..models import Job, TransformResponse
from ..services.queue import job_queue
from ..services.storage import storage

logger = logging.getLogger("inksight.routes.transform")

router = APIRouter()


@router.post("/transform", response_model=TransformResponse)
async def transform_file(
    file: Annotated[UploadFile, File(description=".rm file to transform")],
    preset: Annotated[str, Form(description="Processing preset: minimal, medium, or aggressive")] = "medium",
    api_key: str = Depends(verify_api_key),
):
    """Upload a .rm file for processing.
    
    The file will be queued for processing and you'll receive a job_id.
    Use GET /status/{job_id} to check progress and download the result.
    
    **Presets:**
    - `minimal`: Light touch-up, preserves original character
    - `medium`: Balanced cleanup (default)
    - `aggressive`: Maximum smoothing and cleanup
    """
    # Validate file
    if not file.filename or not file.filename.endswith(".rm"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a .rm file"
        )
    
    # Check file size
    content = await file.read()
    file_size_mb = len(content) / (1024 * 1024)
    if file_size_mb > settings.max_file_size_mb:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size ({file_size_mb:.1f}MB) exceeds limit ({settings.max_file_size_mb}MB)"
        )
    
    # Validate preset
    valid_presets = {"minimal", "medium", "aggressive"}
    if preset not in valid_presets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid preset '{preset}'. Must be one of: {', '.join(valid_presets)}"
        )
    
    # Create job
    user_id = get_user_id_from_key(api_key)
    job = Job(
        user_id=user_id,
        preset=preset,
        input_filename=file.filename,
        input_path="",  # Will be set after saving
    )
    
    # Save uploaded file
    from io import BytesIO
    input_path = storage.save_upload(
        user_id=user_id,
        job_id=job.job_id,
        filename=file.filename,
        content=BytesIO(content)
    )
    job.input_path = str(input_path)
    
    # Enqueue for processing
    await job_queue.enqueue(job)
    
    logger.info(f"Created job {job.job_id} for user {user_id}, file {file.filename}")
    
    return TransformResponse(
        job_id=job.job_id,
        status=job.status,
        created_at=job.created_at,
    )
