# InkSight Cloud - Testing Guide

## Overview

The InkSight Cloud API has a comprehensive test suite designed to catch bugs before they reach production, especially important for when ML models are integrated.

## Prerequisites

**Python 3.10+** is required (rmscene library dependency).

Check your Python version:
```bash
python3 --version
```

If you have Python 3.9 or older, install Python 3.10+ via:
- **macOS**: `brew install python@3.11`
- **Ubuntu**: `sudo apt install python3.11`
- **Windows**: Download from python.org

## Setup

```bash
cd cloud/
python3.10 -m venv venv  # Use python3.11 or newer
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Running Tests

### Quick Test Run
```bash
pytest tests/ -v
```

### With Coverage
```bash
pytest tests/ --cov=app --cov-report=html --cov-report=term-missing
```

Open `htmlcov/index.html` in your browser to see detailed coverage.

### Run Specific Test Suites

```bash
# Authentication tests
pytest tests/test_auth.py -v

# Integration tests (recommended for CI/CD)
pytest tests/test_integration.py -v

# Processing algorithm tests
pytest tests/test_processor.py -v

# Basic API tests
pytest tests/test_transform.py -v
```

### Run Tests Matching Pattern
```bash
# Only auth-related tests
pytest tests/ -k "auth" -v

# Only end-to-end workflow tests
pytest tests/ -k "end_to_end" -v

# Only concurrent processing tests
pytest tests/ -k "concurrent" -v
```

## Test Suite Structure

### Unit Tests
- `test_auth.py` - API key authentication
- `test_processor.py` - Smoothing algorithms
- `test_transform.py` - Basic endpoint validation

### Integration Tests (`test_integration.py`)

Organized into classes by feature area:

#### `TestAuthentication`
- Missing API key rejection
- Invalid API key rejection
- Multi-tenant isolation

#### `TestFileValidation`
- File type validation (.rm only)
- File size limits
- Preset validation
- Empty file handling

#### `TestEndToEndWorkflow`
- Upload → Poll → Download (full cycle)
- Mocked processing (for fast tests)
- Download authentication
- Cross-tenant access prevention

#### `TestHistoryEndpoint`
- Empty history for new users
- Job listing and filtering
- Pagination and limits
- Date sorting

#### `TestConcurrentProcessing`
- Multiple concurrent uploads per user
- Multi-tenant concurrent uploads
- Job queue isolation

#### `TestErrorHandling`
- Nonexistent job lookups
- Invalid UUID formats
- Download before completion
- Permission errors

#### `TestAPIContract`
- OpenAPI schema validation
- Response format verification
- Documentation accuracy

## Test Fixtures

### `conftest.py`
Provides shared fixtures:
- `temp_storage_dir` - Isolated storage for each test
- `test_settings` - Test configuration
- `client` - FastAPI test client
- `api_key` - Valid API key
- `headers` - Request headers with auth

### `tests/fixtures/`
- `test_document.rm` - Minimal .rm file for testing
- `create_test_rm.py` - Script to generate test files

## Coverage Requirements

**Minimum coverage: 70%** (enforced by pytest)

Current coverage focuses on:
- API endpoints (routes)
- Authentication logic
- File validation
- Job queue management
- Multi-tenant isolation

Areas intentionally not covered (external dependencies):
- Storage I/O (mocked in tests)
- rmscene library internals
- Background worker threading

## Writing New Tests

### Integration Test Template

```python
def test_my_feature(client, headers):
    """Test description."""
    # Arrange
    test_data = {"key": "value"}
    
    # Act
    response = client.post("/endpoint", json=test_data, headers=headers)
    
    # Assert
    assert response.status_code == 200
    assert response.json()["result"] == "expected"
```

### Async Test Template

```python
@pytest.mark.asyncio
async def test_my_async_feature(client, headers):
    """Test description."""
    # Upload
    response = client.post("/transform", ...)
    job_id = response.json()["job_id"]
    
    # Wait for processing
    await asyncio.sleep(0.5)
    
    # Verify
    status = client.get(f"/status/{job_id}", headers=headers)
    assert status.json()["status"] in ["completed", "failed"]
```

### Testing Best Practices

1. **Test behavior, not implementation**
   - ✅ Test that upload creates a job with valid UUID
   - ❌ Test that upload calls `storage.save_upload()`

2. **Use descriptive names**
   - ✅ `test_reject_file_exceeding_size_limit`
   - ❌ `test_file_2`

3. **Test error cases**
   - Every success test should have a failure counterpart
   - Invalid input, missing auth, wrong permissions

4. **Isolate tests**
   - Each test should be independent
   - Use fixtures for shared setup
   - Clean up in teardown or use temp directories

5. **Mock external dependencies**
   ```python
   with patch("app.services.queue.process_file") as mock:
       mock.return_value = {"status": "completed"}
       # ... test code
   ```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt
      - run: pytest tests/ --cov=app --cov-fail-under=70
```

### Pre-commit Hook

Create `.git/hooks/pre-commit`:
```bash
#!/bin/bash
cd cloud/
source venv/bin/activate
pytest tests/ --cov=app --cov-fail-under=70 -q
```

Make it executable:
```bash
chmod +x .git/hooks/pre-commit
```

## Debugging Failed Tests

### Verbose Output
```bash
pytest tests/test_integration.py -vv
```

### Print Statements
```bash
pytest tests/ -v -s  # -s shows print() output
```

### Debug Specific Test
```bash
pytest tests/test_integration.py::TestAuthentication::test_missing_api_key_rejected -vv
```

### Drop into debugger on failure
```bash
pytest tests/ --pdb
```

### See slow tests
```bash
pytest tests/ --durations=10
```

## Known Issues

### Python Version
If you see:
```
ERROR: Package 'rmscene' requires a different Python: 3.9.x not in '>=3.10'
```

**Solution**: Use Python 3.10 or newer (see Prerequisites).

### Import Errors
If you see:
```
ModuleNotFoundError: No module named 'app'
```

**Solution**: Run pytest from the `cloud/` directory, not from `cloud/tests/`.

### Async Warnings
If you see warnings about async tests:
```
RuntimeWarning: coroutine was never awaited
```

**Solution**: Ensure async tests are marked with `@pytest.mark.asyncio`.

## Performance

Typical test run times:
- **Full suite**: ~5-10 seconds
- **Integration tests only**: ~3-5 seconds
- **Unit tests only**: <1 second

For faster iteration during development:
```bash
# Run only failed tests from last run
pytest --lf

# Run tests that failed, then all others
pytest --ff
```

## Test Data

The `test_document.rm` fixture is a minimal stub file for API-level testing. For full end-to-end processing validation, you would need a real .rm file from a reMarkable tablet.

To create real test fixtures:
```bash
cd tests/fixtures/
python3 create_test_rm.py
```

This generates a valid .rm v6 file with test strokes.

## Monitoring Test Quality

### Mutation Testing (Future)
Consider adding mutation testing to verify test effectiveness:
```bash
pip install mutmut
mutmut run
```

### Test Coverage Trends
Track coverage over time in CI/CD:
- Upload coverage reports to Codecov or Coveralls
- Set alerts for coverage decreases
- Require coverage >70% for PR merges

## Questions?

See also:
- `README.md` - API documentation
- `DEPLOY.md` - Deployment guide
- `pytest.ini` - Test configuration
