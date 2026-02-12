"""History endpoint - get transform history."""

import logging

from fastapi import APIRouter, Depends, Query

from ..auth import get_user_id_from_key, verify_api_key
from ..models import TransformHistoryItem, TransformHistoryResponse
from ..services.queue import job_queue

logger = logging.getLogger("inksight.routes.history")

router = APIRouter()


@router.get("/transforms", response_model=TransformHistoryResponse)
async def get_transform_history(
    limit: int = Query(default=100, ge=1, le=1000, description="Maximum number of results"),
    api_key: str = Depends(verify_api_key),
):
    """Get processing history for the authenticated user.
    
    Returns a list of recent transform jobs with their status.
    """
    user_id = get_user_id_from_key(api_key)
    
    # Get user's jobs
    jobs = job_queue.get_user_jobs(user_id, limit=limit)
    
    # Build response
    history_items = [
        TransformHistoryItem(
            job_id=job.job_id,
            status=job.status,
            preset=job.preset,
            filename=job.input_filename,
            created_at=job.created_at,
            completed_at=job.completed_at,
        )
        for job in jobs
    ]
    
    return TransformHistoryResponse(
        transforms=history_items,
        total=len(history_items),
    )
