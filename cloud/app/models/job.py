"""Job models for async processing."""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    """Status of a processing job."""
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ProcessingStats(BaseModel):
    """Statistics about the processing job."""
    strokes_processed: int = 0
    strokes_smoothed: int = 0
    strokes_straightened: int = 0
    strokes_skipped: int = 0
    processing_time_ms: Optional[int] = None


class Job(BaseModel):
    """Represents a file processing job."""
    job_id: UUID = Field(default_factory=uuid4)
    user_id: str
    status: JobStatus = JobStatus.QUEUED
    preset: str = "medium"
    
    # File references
    input_filename: str
    input_path: str
    output_path: Optional[str] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Processing info
    progress: int = 0  # 0-100
    error_message: Optional[str] = None
    stats: Optional[ProcessingStats] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "job_id": "550e8400-e29b-41d4-a716-446655440000",
                "user_id": "iks_live_abc123",
                "status": "completed",
                "preset": "medium",
                "input_filename": "document.rm",
                "progress": 100,
                "created_at": "2026-02-11T18:00:00Z",
                "completed_at": "2026-02-11T18:00:05Z",
            }
        }
