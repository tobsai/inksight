"""Test fixtures for InkSight Cloud tests."""

from pathlib import Path

FIXTURES_DIR = Path(__file__).parent

def get_test_rm_file() -> bytes:
    """Get content of test .rm file.
    
    Note: This is a minimal stub file for API-level testing.
    For full end-to-end processing tests, a real .rm file created
    with rmscene would be needed.
    """
    test_file = FIXTURES_DIR / "test_document.rm"
    with open(test_file, "rb") as f:
        return f.read()
