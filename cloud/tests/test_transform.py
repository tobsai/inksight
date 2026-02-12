"""Tests for transform endpoint."""

import io

import pytest
from fastapi import status


def test_root_endpoint(client):
    """Root endpoint should return API info."""
    response = client.get("/")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["name"] == "InkSight Cloud API"
    assert "version" in data


def test_health_endpoint(client):
    """Health check endpoint should return healthy."""
    response = client.get("/health")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "healthy"


def test_transform_without_file(client, headers):
    """Transform request without file should fail."""
    response = client.post("/transform", headers=headers)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_transform_invalid_file_type(client, headers):
    """Transform request with non-.rm file should fail."""
    files = {"file": ("test.txt", io.BytesIO(b"test content"), "text/plain")}
    response = client.post("/transform", files=files, headers=headers)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert ".rm file" in response.json()["detail"]


def test_transform_invalid_preset(client, headers):
    """Transform request with invalid preset should fail."""
    files = {"file": ("test.rm", io.BytesIO(b"fake rm content"), "application/octet-stream")}
    data = {"preset": "invalid"}
    response = client.post("/transform", files=files, data=data, headers=headers)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Invalid preset" in response.json()["detail"]


def test_transform_valid_request(client, headers):
    """Valid transform request should create a job."""
    # Create a minimal fake .rm file (won't process correctly, but will be accepted)
    files = {"file": ("test.rm", io.BytesIO(b"fake rm content"), "application/octet-stream")}
    data = {"preset": "medium"}
    
    response = client.post("/transform", files=files, data=data, headers=headers)
    assert response.status_code == status.HTTP_200_OK
    
    result = response.json()
    assert "job_id" in result
    assert result["status"] == "queued"
    assert "created_at" in result


def test_transform_presets(client, headers):
    """All valid presets should be accepted."""
    for preset in ["minimal", "medium", "aggressive"]:
        files = {"file": ("test.rm", io.BytesIO(b"fake rm content"), "application/octet-stream")}
        data = {"preset": preset}
        
        response = client.post("/transform", files=files, data=data, headers=headers)
        assert response.status_code == status.HTTP_200_OK
