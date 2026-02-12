"""File storage service.

MVP: Local filesystem storage
Future: S3/R2 with per-tenant prefixes
"""

import logging
from pathlib import Path
from typing import BinaryIO
from uuid import UUID

from ..config import settings

logger = logging.getLogger("inksight.storage")


class Storage:
    """File storage abstraction layer."""
    
    def __init__(self, base_dir: Path | None = None):
        """Initialize storage with base directory."""
        self.base_dir = base_dir or settings.storage_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Storage initialized at {self.base_dir}")
    
    def _get_user_dir(self, user_id: str) -> Path:
        """Get user-specific storage directory."""
        user_dir = self.base_dir / user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir
    
    def save_upload(self, user_id: str, job_id: UUID, filename: str, content: BinaryIO) -> Path:
        """Save an uploaded file.
        
        Args:
            user_id: User ID for tenant isolation
            job_id: Job ID for unique naming
            filename: Original filename
            content: File content as binary stream
            
        Returns:
            Path to saved file
        """
        user_dir = self._get_user_dir(user_id)
        file_path = user_dir / f"{job_id}_input_{filename}"
        
        with open(file_path, "wb") as f:
            f.write(content.read())
        
        logger.info(f"Saved upload to {file_path}")
        return file_path
    
    def save_output(self, user_id: str, job_id: UUID, filename: str, content: bytes) -> Path:
        """Save a processed output file.
        
        Args:
            user_id: User ID for tenant isolation
            job_id: Job ID for unique naming
            filename: Original filename
            content: File content as bytes
            
        Returns:
            Path to saved file
        """
        user_dir = self._get_user_dir(user_id)
        file_path = user_dir / f"{job_id}_output_{filename}"
        
        with open(file_path, "wb") as f:
            f.write(content)
        
        logger.info(f"Saved output to {file_path}")
        return file_path
    
    def get_file(self, user_id: str, job_id: UUID, file_type: str = "output") -> Path | None:
        """Get path to a file.
        
        Args:
            user_id: User ID
            job_id: Job ID
            file_type: "input" or "output"
            
        Returns:
            Path to file if exists, None otherwise
        """
        user_dir = self._get_user_dir(user_id)
        pattern = f"{job_id}_{file_type}_*.rm"
        
        matches = list(user_dir.glob(pattern))
        if matches:
            return matches[0]
        return None
    
    def delete_file(self, file_path: Path) -> bool:
        """Delete a file.
        
        Args:
            file_path: Path to file
            
        Returns:
            True if deleted, False if not found
        """
        try:
            if file_path.exists():
                file_path.unlink()
                logger.info(f"Deleted {file_path}")
                return True
        except Exception as e:
            logger.error(f"Failed to delete {file_path}: {e}")
        return False
    
    def cleanup_job_files(self, user_id: str, job_id: UUID):
        """Delete all files associated with a job.
        
        Args:
            user_id: User ID
            job_id: Job ID
        """
        user_dir = self._get_user_dir(user_id)
        pattern = f"{job_id}_*"
        
        for file_path in user_dir.glob(pattern):
            self.delete_file(file_path)


# Global storage instance
storage = Storage()
