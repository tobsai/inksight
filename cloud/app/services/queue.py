"""Job queue manager.

MVP: In-memory queue with background processing
Future: Redis + Celery for multi-worker scalability
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict
from uuid import UUID

from ..models import Job, JobStatus
from .processor import process_file

logger = logging.getLogger("inksight.queue")


class JobQueue:
    """In-memory job queue with async background processing."""
    
    def __init__(self):
        """Initialize the job queue."""
        self.jobs: Dict[UUID, Job] = {}
        self.processing_task: asyncio.Task | None = None
        logger.info("JobQueue initialized")
    
    async def enqueue(self, job: Job) -> Job:
        """Add a job to the queue.
        
        Args:
            job: Job to enqueue
            
        Returns:
            The enqueued job
        """
        self.jobs[job.job_id] = job
        logger.info(f"Enqueued job {job.job_id} for user {job.user_id}")
        
        # Start processing if not already running
        if self.processing_task is None or self.processing_task.done():
            self.processing_task = asyncio.create_task(self._process_queue())
        
        return job
    
    def get_job(self, job_id: UUID) -> Job | None:
        """Get a job by ID.
        
        Args:
            job_id: Job ID
            
        Returns:
            Job if found, None otherwise
        """
        return self.jobs.get(job_id)
    
    def get_user_jobs(self, user_id: str, limit: int = 100) -> list[Job]:
        """Get jobs for a user.
        
        Args:
            user_id: User ID
            limit: Maximum number of jobs to return
            
        Returns:
            List of jobs, sorted by created_at descending
        """
        user_jobs = [job for job in self.jobs.values() if job.user_id == user_id]
        user_jobs.sort(key=lambda j: j.created_at, reverse=True)
        return user_jobs[:limit]
    
    def update_job(self, job: Job):
        """Update a job in the queue.
        
        Args:
            job: Updated job
        """
        self.jobs[job.job_id] = job
    
    async def _process_queue(self):
        """Background task to process queued jobs."""
        logger.info("Starting queue processor")
        
        while True:
            # Find next queued job
            queued = [job for job in self.jobs.values() if job.status == JobStatus.QUEUED]
            
            if not queued:
                # No jobs to process, sleep and check again
                await asyncio.sleep(1)
                continue
            
            # Process oldest job first
            job = min(queued, key=lambda j: j.created_at)
            
            try:
                await self._process_job(job)
            except Exception as e:
                logger.error(f"Failed to process job {job.job_id}: {e}", exc_info=True)
                job.status = JobStatus.FAILED
                job.error_message = str(e)
                job.completed_at = datetime.utcnow()
                self.update_job(job)
            
            # Brief pause between jobs
            await asyncio.sleep(0.1)
    
    async def _process_job(self, job: Job):
        """Process a single job.
        
        This is where we call the FileProcessor to do the actual work.
        For now, this is a stub that will be connected to the processor.
        
        Args:
            job: Job to process
        """
        logger.info(f"Processing job {job.job_id}")
        
        # Update status
        job.status = JobStatus.PROCESSING
        job.started_at = datetime.utcnow()
        job.progress = 10
        self.update_job(job)
        
        # Run the processor (offload to thread pool for CPU-bound work)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, process_file, job)
        
        # Update with results
        job.status = result["status"]
        job.progress = 100 if result["status"] == JobStatus.COMPLETED else job.progress
        job.completed_at = datetime.utcnow()
        job.output_path = result.get("output_path")
        job.error_message = result.get("error")
        job.stats = result.get("stats")
        
        self.update_job(job)
        logger.info(f"Completed job {job.job_id} with status {job.status}")


# Global queue instance
job_queue = JobQueue()
