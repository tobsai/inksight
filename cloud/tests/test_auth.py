"""Tests for authentication."""

import pytest
from fastapi import status


def test_missing_api_key(client):
    """Request without API key should fail."""
    response = client.get("/transforms")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert "Missing API key" in response.json()["detail"]


def test_invalid_api_key(client):
    """Request with invalid API key should fail."""
    headers = {"X-API-Key": "invalid_key"}
    response = client.get("/transforms", headers=headers)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert "Invalid API key" in response.json()["detail"]


def test_valid_api_key(client, headers):
    """Request with valid API key should succeed."""
    response = client.get("/transforms", headers=headers)
    assert response.status_code == status.HTTP_200_OK


def test_multiple_valid_keys(client):
    """Both configured API keys should work."""
    for key in ["test_key_123", "test_key_456"]:
        headers = {"X-API-Key": key}
        response = client.get("/transforms", headers=headers)
        assert response.status_code == status.HTTP_200_OK
