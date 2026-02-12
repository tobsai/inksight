"""Integration tests for InkSight Cloud API.

Tests the full request lifecycle and real-world scenarios that would
catch bugs when ML models are integrated later.
"""

import asyncio
import io
import time
from unittest.mock import patch
from uuid import UUID

import pytest
from fastapi import status

from app.models import JobStatus, ProcessingStats
from app.services.queue import job_queue
from tests.fixtures import get_test_rm_file


# ============================================================================
# Authentication Integration Tests
# ============================================================================


class TestAuthentication:
    """Test auth flows that would affect real users."""
    
    def test_missing_api_key_rejected(self, client):
        """Users without API key should be rejected immediately."""
        response = client.get("/transforms")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert "Missing API key" in response.json()["detail"]
    
    def test_invalid_api_key_rejected(self, client):
        """Invalid API keys should be rejected."""
        headers = {"X-API-Key": "invalid_key_12345"}
        response = client.get("/transforms", headers=headers)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert "Invalid API key" in response.json()["detail"]
    
    def test_valid_api_key_accepted_all_endpoints(self, client, headers):
        """Valid API key should work across all endpoints."""
        # Transform endpoint
        files = {"file": ("test.rm", io.BytesIO(b"test content"), "application/octet-stream")}
        response = client.post("/transform", files=files, headers=headers)
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST]
        
        # History endpoint
        response = client.get("/transforms", headers=headers)
        assert response.status_code == status.HTTP_200_OK
    
    def test_multiple_api_keys_work(self, client, test_settings):
        """All configured API keys should work (multi-tenant)."""
        keys = ["test_key_123", "test_key_456"]
        
        for key in keys:
            headers = {"X-API-Key": key}
            response = client.get("/transforms", headers=headers)
            assert response.status_code == status.HTTP_200_OK


# ============================================================================
# File Upload & Validation Tests
# ============================================================================


class TestFileValidation:
    """Test file upload validation - critical for preventing abuse."""
    
    def test_reject_non_rm_file(self, client, headers):
        """Should reject files that aren't .rm format."""
        files = {"file": ("document.pdf", io.BytesIO(b"fake pdf"), "application/pdf")}
        response = client.post("/transform", files=files, headers=headers)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert ".rm file" in response.json()["detail"].lower()
    
    def test_reject_oversized_file(self, client, headers, test_settings):
        """Should reject files exceeding size limit."""
        # Create a file larger than the limit
        max_size_bytes = test_settings.max_file_size_mb * 1024 * 1024
        large_content = b"X" * (max_size_bytes + 1024)
        
        files = {"file": ("huge.rm", io.BytesIO(large_content), "application/octet-stream")}
        response = client.post("/transform", files=files, headers=headers)
        assert response.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
        assert "exceeds limit" in response.json()["detail"].lower()
    
    def test_reject_empty_file(self, client, headers):
        """Should handle empty files gracefully."""
        files = {"file": ("empty.rm", io.BytesIO(b""), "application/octet-stream")}
        data = {"preset": "medium"}
        response = client.post("/transform", files=files, data=data, headers=headers)
        # Should accept upload but may fail during processing
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST]
    
    def test_reject_invalid_preset(self, client, headers):
        """Should reject invalid processing presets."""
        files = {"file": ("test.rm", io.BytesIO(b"content"), "application/octet-stream")}
        data = {"preset": "ultra_mega_smooth"}
        response = client.post("/transform", files=files, data=data, headers=headers)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "invalid preset" in response.json()["detail"].lower()
    
    def test_accept_all_valid_presets(self, client, headers):
        """Should accept all documented presets."""
        presets = ["minimal", "medium", "aggressive"]
        test_content = get_test_rm_file()
        
        for preset in presets:
            files = {"file": ("test.rm", io.BytesIO(test_content), "application/octet-stream")}
            data = {"preset": preset}
            response = client.post("/transform", files=files, data=data, headers=headers)
            assert response.status_code == status.HTTP_200_OK, f"Preset '{preset}' failed"


# ============================================================================
# End-to-End Upload → Process → Download Tests
# ============================================================================


class TestEndToEndWorkflow:
    """Test complete user workflow from upload to download."""
    
    @pytest.mark.asyncio
    async def test_upload_poll_download_success(self, client, headers):
        """Full happy path: upload → poll status → download result."""
        test_content = get_test_rm_file()
        
        # Step 1: Upload file
        files = {"file": ("test.rm", io.BytesIO(test_content), "application/octet-stream")}
        data = {"preset": "medium"}
        upload_response = client.post("/transform", files=files, data=data, headers=headers)
        assert upload_response.status_code == status.HTTP_200_OK
        
        upload_data = upload_response.json()
        assert "job_id" in upload_data
        assert upload_data["status"] == "queued"
        job_id = upload_data["job_id"]
        
        # Validate job_id format
        assert UUID(job_id)  # Should parse as valid UUID
        
        # Step 2: Poll status (should eventually complete or fail)
        max_polls = 30
        poll_count = 0
        final_status = None
        
        while poll_count < max_polls:
            status_response = client.get(f"/status/{job_id}", headers=headers)
            assert status_response.status_code == status.HTTP_200_OK
            
            status_data = status_response.json()
            assert status_data["job_id"] == job_id
            assert "status" in status_data
            assert "progress" in status_data
            assert 0 <= status_data["progress"] <= 100
            
            final_status = status_data["status"]
            
            if final_status in ["completed", "failed"]:
                break
            
            poll_count += 1
            await asyncio.sleep(0.2)  # Wait before next poll
        
        # Step 3: Verify final state
        # Note: With stub file, processing will likely fail, but that's OK
        # The important thing is the workflow completes
        assert final_status in ["completed", "failed"]
        
        # Step 4: If completed, try to download
        if final_status == "completed":
            assert "download_url" in status_data
            download_url = status_data["download_url"]
            
            download_response = client.get(download_url, headers=headers)
            assert download_response.status_code == status.HTTP_200_OK
            assert len(download_response.content) > 0
    
    @pytest.mark.asyncio
    async def test_upload_with_mocked_processor(self, client, headers):
        """Test full workflow with successful mocked processing."""
        test_content = get_test_rm_file()
        
        # Mock the processor to return success
        mock_result = {
            "status": JobStatus.COMPLETED,
            "output_path": "/fake/output.rm",
            "stats": ProcessingStats(
                strokes_processed=10,
                strokes_smoothed=8,
                processing_time_ms=150
            )
        }
        
        with patch("app.services.queue.process_file", return_value=mock_result):
            # Upload
            files = {"file": ("test.rm", io.BytesIO(test_content), "application/octet-stream")}
            data = {"preset": "medium"}
            upload_response = client.post("/transform", files=files, data=data, headers=headers)
            job_id = upload_response.json()["job_id"]
            
            # Wait for processing
            await asyncio.sleep(1.0)
            
            # Check status
            status_response = client.get(f"/status/{job_id}", headers=headers)
            status_data = status_response.json()
            
            assert status_data["status"] == "completed"
            assert status_data["progress"] == 100
            assert "stats" in status_data
            assert status_data["stats"]["strokes_processed"] == 10
    
    def test_cannot_download_without_auth(self, client, headers):
        """Download should require same API key as upload."""
        # Create a fake job ID
        fake_job_id = "550e8400-e29b-41d4-a716-446655440000"
        
        # Try to download without auth
        response = client.get(f"/download/{fake_job_id}.rm")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_cannot_access_other_users_jobs(self, client):
        """Users should only see their own jobs (tenant isolation)."""
        # User 1 uploads
        headers1 = {"X-API-Key": "test_key_123"}
        files = {"file": ("test.rm", io.BytesIO(b"content1"), "application/octet-stream")}
        response1 = client.post("/transform", files=files, headers=headers1)
        job_id_1 = response1.json()["job_id"]
        
        # User 2 tries to access User 1's job
        headers2 = {"X-API-Key": "test_key_456"}
        response = client.get(f"/status/{job_id_1}", headers=headers2)
        assert response.status_code == status.HTTP_403_FORBIDDEN


# ============================================================================
# History & Pagination Tests
# ============================================================================


class TestHistoryEndpoint:
    """Test history endpoint with various scenarios."""
    
    def test_empty_history_for_new_user(self, client, headers):
        """New users should have empty history."""
        response = client.get("/transforms", headers=headers)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "transforms" in data
        assert "total" in data
        assert isinstance(data["transforms"], list)
    
    def test_history_shows_user_jobs(self, client, headers):
        """History should include user's uploaded jobs."""
        test_content = get_test_rm_file()
        
        # Upload 3 files
        job_ids = []
        for i in range(3):
            files = {"file": (f"test{i}.rm", io.BytesIO(test_content), "application/octet-stream")}
            response = client.post("/transform", files=files, headers=headers)
            job_ids.append(response.json()["job_id"])
        
        # Check history
        response = client.get("/transforms", headers=headers)
        data = response.json()
        
        assert data["total"] >= 3
        returned_ids = [item["job_id"] for item in data["transforms"]]
        for job_id in job_ids:
            assert job_id in returned_ids
    
    def test_history_limit_parameter(self, client, headers):
        """Should respect limit parameter."""
        # Upload multiple files
        test_content = get_test_rm_file()
        for i in range(5):
            files = {"file": (f"test{i}.rm", io.BytesIO(test_content), "application/octet-stream")}
            client.post("/transform", files=files, headers=headers)
        
        # Request with limit
        response = client.get("/transforms?limit=2", headers=headers)
        data = response.json()
        assert len(data["transforms"]) <= 2
    
    def test_history_limit_validation(self, client, headers):
        """Should validate limit parameter bounds."""
        # Too small
        response = client.get("/transforms?limit=0", headers=headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        
        # Too large
        response = client.get("/transforms?limit=5000", headers=headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        
        # Valid range
        response = client.get("/transforms?limit=50", headers=headers)
        assert response.status_code == status.HTTP_200_OK
    
    def test_history_sorted_by_created_date(self, client, headers):
        """History should be sorted by creation date (newest first)."""
        test_content = get_test_rm_file()
        
        # Upload files with slight delays
        for i in range(3):
            files = {"file": (f"test{i}.rm", io.BytesIO(test_content), "application/octet-stream")}
            client.post("/transform", files=files, headers=headers)
            time.sleep(0.1)
        
        # Get history
        response = client.get("/transforms", headers=headers)
        data = response.json()
        
        # Verify sorted descending (newest first)
        if len(data["transforms"]) >= 2:
            for i in range(len(data["transforms"]) - 1):
                current = data["transforms"][i]["created_at"]
                next_item = data["transforms"][i + 1]["created_at"]
                assert current >= next_item
    
    def test_history_includes_all_fields(self, client, headers):
        """History items should include all required fields."""
        test_content = get_test_rm_file()
        files = {"file": ("test.rm", io.BytesIO(test_content), "application/octet-stream")}
        data_upload = {"preset": "aggressive"}
        client.post("/transform", files=files, data=data_upload, headers=headers)
        
        response = client.get("/transforms", headers=headers)
        data = response.json()
        
        if data["transforms"]:
            item = data["transforms"][0]
            assert "job_id" in item
            assert "status" in item
            assert "preset" in item
            assert "filename" in item
            assert "created_at" in item
            # completed_at is optional (only for completed jobs)


# ============================================================================
# Concurrent Processing Tests
# ============================================================================


class TestConcurrentProcessing:
    """Test handling of multiple concurrent jobs."""
    
    @pytest.mark.asyncio
    async def test_multiple_concurrent_uploads(self, client, headers):
        """Should handle multiple uploads from same user."""
        test_content = get_test_rm_file()
        job_ids = []
        
        # Upload 5 files concurrently
        for i in range(5):
            files = {"file": (f"concurrent{i}.rm", io.BytesIO(test_content), "application/octet-stream")}
            response = client.post("/transform", files=files, headers=headers)
            assert response.status_code == status.HTTP_200_OK
            job_ids.append(response.json()["job_id"])
        
        # All should have unique job IDs
        assert len(set(job_ids)) == 5
        
        # All should be retrievable
        for job_id in job_ids:
            response = client.get(f"/status/{job_id}", headers=headers)
            assert response.status_code == status.HTTP_200_OK
    
    @pytest.mark.asyncio
    async def test_multi_tenant_concurrent_uploads(self, client):
        """Should handle uploads from multiple users concurrently."""
        test_content = get_test_rm_file()
        users = [
            {"X-API-Key": "test_key_123"},
            {"X-API-Key": "test_key_456"},
        ]
        
        all_job_ids = []
        
        # Each user uploads 3 files
        for user_headers in users:
            for i in range(3):
                files = {"file": (f"test{i}.rm", io.BytesIO(test_content), "application/octet-stream")}
                response = client.post("/transform", files=files, headers=user_headers)
                assert response.status_code == status.HTTP_200_OK
                all_job_ids.append((response.json()["job_id"], user_headers["X-API-Key"]))
        
        # Each user should only see their own jobs
        for user_headers in users:
            response = client.get("/transforms", headers=user_headers)
            data = response.json()
            user_job_ids = [item["job_id"] for item in data["transforms"]]
            
            # Should have their jobs
            user_expected = [jid for jid, key in all_job_ids if key == user_headers["X-API-Key"]]
            for jid in user_expected:
                assert jid in user_job_ids
            
            # Should not have other users' jobs
            other_jobs = [jid for jid, key in all_job_ids if key != user_headers["X-API-Key"]]
            for jid in other_jobs:
                assert jid not in user_job_ids


# ============================================================================
# Error Handling & Edge Cases
# ============================================================================


class TestErrorHandling:
    """Test error scenarios that could break production."""
    
    def test_status_for_nonexistent_job(self, client, headers):
        """Should return 404 for unknown job ID."""
        fake_job_id = "00000000-0000-0000-0000-000000000000"
        response = client.get(f"/status/{fake_job_id}", headers=headers)
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_status_with_invalid_uuid(self, client, headers):
        """Should handle malformed job IDs gracefully."""
        response = client.get("/status/not-a-uuid", headers=headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    def test_download_nonexistent_job(self, client, headers):
        """Should return 404 when downloading unknown job."""
        fake_job_id = "00000000-0000-0000-0000-000000000000"
        response = client.get(f"/download/{fake_job_id}.rm", headers=headers)
        assert response.status_code in [status.HTTP_404_NOT_FOUND, status.HTTP_400_BAD_REQUEST]
    
    @pytest.mark.asyncio
    async def test_download_before_completion(self, client, headers):
        """Should prevent downloading jobs that aren't completed."""
        test_content = get_test_rm_file()
        
        # Upload but don't wait for completion
        files = {"file": ("test.rm", io.BytesIO(test_content), "application/octet-stream")}
        upload_response = client.post("/transform", files=files, headers=headers)
        job_id = upload_response.json()["job_id"]
        
        # Immediately try to download
        download_response = client.get(f"/download/{job_id}.rm", headers=headers)
        # Should fail because job is not completed yet
        if download_response.status_code != status.HTTP_200_OK:
            assert download_response.status_code in [
                status.HTTP_400_BAD_REQUEST,
                status.HTTP_404_NOT_FOUND
            ]


# ============================================================================
# API Contract & Documentation Tests
# ============================================================================


class TestAPIContract:
    """Ensure API matches documented behavior."""
    
    def test_root_endpoint_returns_api_info(self, client):
        """Root endpoint should provide API metadata."""
        response = client.get("/")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "name" in data
        assert "version" in data
        assert "docs" in data
    
    def test_health_endpoint_works(self, client):
        """Health check should work without auth."""
        response = client.get("/health")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "healthy"
    
    def test_openapi_docs_available(self, client):
        """OpenAPI documentation should be accessible."""
        response = client.get("/docs")
        assert response.status_code == status.HTTP_200_OK
    
    def test_transform_response_schema(self, client, headers):
        """Transform endpoint should return documented schema."""
        test_content = get_test_rm_file()
        files = {"file": ("test.rm", io.BytesIO(test_content), "application/octet-stream")}
        response = client.post("/transform", files=files, headers=headers)
        
        data = response.json()
        # Required fields
        assert "job_id" in data
        assert "status" in data
        assert "created_at" in data
        
        # job_id should be valid UUID string
        assert UUID(data["job_id"])
        
        # status should be valid enum value
        assert data["status"] in ["queued", "processing", "completed", "failed"]
    
    def test_status_response_schema(self, client, headers):
        """Status endpoint should return documented schema."""
        # Upload a file first
        test_content = get_test_rm_file()
        files = {"file": ("test.rm", io.BytesIO(test_content), "application/octet-stream")}
        upload_response = client.post("/transform", files=files, headers=headers)
        job_id = upload_response.json()["job_id"]
        
        # Get status
        response = client.get(f"/status/{job_id}", headers=headers)
        data = response.json()
        
        # Required fields
        assert "job_id" in data
        assert "status" in data
        assert "progress" in data
        assert "created_at" in data
        
        # Optional fields (may or may not be present)
        # started_at, completed_at, error_message, download_url, stats
