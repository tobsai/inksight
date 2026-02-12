"""Pytest configuration and fixtures."""

import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, settings
from app.main import app


@pytest.fixture
def temp_storage_dir():
    """Create a temporary directory for file storage during tests."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def test_settings(temp_storage_dir):
    """Override settings for testing."""
    original_storage_dir = settings.storage_dir
    original_api_keys = settings.api_keys
    
    # Set test configuration
    settings.storage_dir = temp_storage_dir
    settings.api_keys = "test_key_123,test_key_456"
    
    yield settings
    
    # Restore original settings
    settings.storage_dir = original_storage_dir
    settings.api_keys = original_api_keys


@pytest.fixture
def client(test_settings):
    """Create a test client."""
    return TestClient(app)


@pytest.fixture
def api_key():
    """Valid API key for testing."""
    return "test_key_123"


@pytest.fixture
def headers(api_key):
    """Request headers with valid API key."""
    return {"X-API-Key": api_key}
