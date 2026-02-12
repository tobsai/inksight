"""Transform request/response models."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from .job import JobStatus, ProcessingStats


class TransformRequest(BaseModel):
    """Request to transform a file."""
    preset: str = Field(default="medium", description="Processing preset: minimal, medium, or aggressive")
    
    class Config:
        json_schema_extra = {
            "example": {
                "preset": "medium"
            }
        }


class TransformResponse(BaseModel):
    """Response after submitting a transform job."""
    job_id: UUID
    status: JobStatus
    created_at: datetime
    
    class Config:
        json_schema_extra = {
            "example": {
                "job_id": "550e8400-e29b-41d4-a716-446655440000",
                "status": "queued",
                "created_at": "2026-02-11T18:00:00Z"
            }
        }


class TransformStatusResponse(BaseModel):
    """Response for job status check."""
    job_id: UUID
    status: JobStatus
    progress: int
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    download_url: Optional[str] = None
    error_message: Optional[str] = None
    stats: Optional[ProcessingStats] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "job_id": "550e8400-e29b-41d4-a716-446655440000",
                "status": "completed",
                "progress": 100,
                "created_at": "2026-02-11T18:00:00Z",
                "completed_at": "2026-02-11T18:00:05Z",
                "download_url": "/download/550e8400-e29b-41d4-a716-446655440000.rm",
                "stats": {
                    "strokes_processed": 342,
                    "strokes_smoothed": 287
                }
            }
        }


class TransformHistoryItem(BaseModel):
    """Single item in transform history."""
    job_id: UUID
    status: JobStatus
    preset: str
    filename: str
    created_at: datetime
    completed_at: Optional[datetime] = None


class TransformHistoryResponse(BaseModel):
    """Response containing transform history."""
    transforms: List[TransformHistoryItem]
    total: int
    
    class Config:
        json_schema_extra = {
            "example": {
                "transforms": [
                    {
                        "job_id": "550e8400-e29b-41d4-a716-446655440000",
                        "status": "completed",
                        "preset": "medium",
                        "filename": "document.rm",
                        "created_at": "2026-02-11T18:00:00Z",
                        "completed_at": "2026-02-11T18:00:05Z"
                    }
                ],
                "total": 1
            }
        }
