"""Status endpoint - check job status and download results."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from ..auth import get_user_id_from_key, verify_api_key
from ..models import JobStatus, TransformStatusResponse
from ..services.queue import job_queue
from ..services.storage import storage

logger = logging.getLogger("inksight.routes.status")

router = APIRouter()


@router.get("/status/{job_id}", response_model=TransformStatusResponse)
async def get_job_status(
    job_id: UUID,
    api_key: str = Depends(verify_api_key),
):
    """Check the status of a processing job.
    
    Returns the current status and progress. When completed, includes
    a download_url to retrieve the processed file.
    """
    user_id = get_user_id_from_key(api_key)
    
    # Get job
    job = job_queue.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found"
        )
    
    # Verify ownership
    if job.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Build response
    response = TransformStatusResponse(
        job_id=job.job_id,
        status=job.status,
        progress=job.progress,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        error_message=job.error_message,
        stats=job.stats,
    )
    
    # Add download URL if completed
    if job.status == JobStatus.COMPLETED and job.output_path:
        response.download_url = f"/download/{job.job_id}.rm"
    
    return response


@router.get("/download/{job_id}.rm")
async def download_result(
    job_id: UUID,
    api_key: str = Depends(verify_api_key),
):
    """Download the processed .rm file for a completed job."""
    user_id = get_user_id_from_key(api_key)
    
    # Get job
    job = job_queue.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found"
        )
    
    # Verify ownership
    if job.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Check if completed
    if job.status != JobStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job is not completed (status: {job.status})"
        )
    
    # Get output file
    output_path = storage.get_file(user_id, job_id, "output")
    if not output_path or not output_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Output file not found"
        )
    
    return FileResponse(
        path=output_path,
        media_type="application/octet-stream",
        filename=job.input_filename,
    )
