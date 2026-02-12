# InkSight Cloud API

Multi-tenant SaaS tier for AI-powered handwriting improvement on reMarkable tablets.

**Requirements:** Python 3.10+ (required by rmscene library)

## Architecture Overview

```
┌──────────────────┐     HTTPS          ┌─────────────────────────┐
│  Device Daemon    │ ◄────────────────► │  FastAPI Application    │
│  (reMarkable)     │  Upload .rm files  │                         │
│                   │  Download results  │  ┌───────────────────┐  │
└──────────────────┘                    │  │  Auth Middleware   │  │
                                         │  │  (API Key)         │  │
                                         │  └───────────────────┘  │
                                         │                         │
                                         │  ┌───────────────────┐  │
                                         │  │  Routes            │  │
                                         │  │  /transform        │  │
                                         │  │  /status/{job_id}  │  │
                                         │  │  /transforms       │  │
                                         │  └─────────┬─────────┘  │
                                         │            │            │
                                         │  ┌─────────▼─────────┐  │
                                         │  │  Job Queue         │  │
                                         │  │  (In-memory MVP)   │  │
                                         │  └─────────┬─────────┘  │
                                         │            │            │
                                         │  ┌─────────▼─────────┐  │
                                         │  │  Processing        │  │
                                         │  │  (Smoothing algos) │  │
                                         │  └───────────────────┘  │
                                         │                         │
                                         │  ┌───────────────────┐  │
                                         │  │  Storage           │  │
                                         │  │  (Local files MVP) │  │
                                         │  └───────────────────┘  │
                                         └─────────────────────────┘
```

## Tech Stack

- **Framework**: FastAPI (async, fast, OpenAPI docs)
- **Auth**: API key-based (header: `X-API-Key`)
- **Processing**: Reuses device smoothing algorithms (Gaussian, RDP, line straightening)
- **Queue**: In-memory for MVP (ready for Redis/Celery later)
- **Storage**: Local filesystem for MVP (ready for S3/R2 later)
- **Deployment**: Docker + Railway/Fly.io

## Project Structure

```
cloud/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app entry point
│   ├── config.py            # Settings & environment
│   ├── auth.py              # API key middleware
│   ├── models/              # Pydantic models
│   │   ├── __init__.py
│   │   ├── job.py           # Job, JobStatus
│   │   └── transform.py     # TransformRequest, TransformResponse
│   ├── routes/              # API endpoints
│   │   ├── __init__.py
│   │   ├── transform.py     # POST /transform
│   │   ├── status.py        # GET /status/{job_id}
│   │   └── history.py       # GET /transforms
│   ├── services/            # Business logic
│   │   ├── __init__.py
│   │   ├── processor.py     # File processing (reuses device smoothing)
│   │   ├── queue.py         # Job queue manager
│   │   └── storage.py       # File storage abstraction
│   └── smoothing/           # Smoothing algorithms (copied from device)
│       ├── __init__.py
│       └── algorithms.py    # Gaussian, RDP, line straightening, etc.
├── tests/
│   ├── __init__.py
│   ├── test_auth.py
│   ├── test_transform.py
│   └── test_processor.py
├── Dockerfile
├── docker-compose.yml       # Local dev environment
├── requirements.txt
├── .dockerignore
└── README.md
```

## API Endpoints

### `POST /transform`
Upload a `.rm` file for processing.

**Request:**
```bash
curl -X POST https://api.inksight.io/transform \
  -H "X-API-Key: YOUR_API_KEY" \
  -F "file=@document.rm" \
  -F "preset=medium"
```

**Response:**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "created_at": "2026-02-11T18:00:00Z"
}
```

### `GET /status/{job_id}`
Check job status and download result.

**Response (queued):**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "progress": 45,
  "created_at": "2026-02-11T18:00:00Z"
}
```

**Response (completed):**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "download_url": "/download/550e8400-e29b-41d4-a716-446655440000.rm",
  "created_at": "2026-02-11T18:00:00Z",
  "completed_at": "2026-02-11T18:00:05Z",
  "stats": {
    "strokes_processed": 342,
    "strokes_smoothed": 287
  }
}
```

### `GET /transforms`
Get processing history for the authenticated user.

**Response:**
```json
{
  "transforms": [
    {
      "job_id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "completed",
      "created_at": "2026-02-11T18:00:00Z",
      "preset": "medium"
    }
  ],
  "total": 1
}
```

## Processing Presets

| Preset | Description | Settings |
|--------|-------------|----------|
| `minimal` | Light touch-up | Gaussian σ=0.8, no RDP |
| `medium` | Balanced cleanup (default) | Gaussian σ=1.0, RDP ε=2.0 |
| `aggressive` | Maximum smoothing | Gaussian σ=1.5, RDP ε=3.0 |

## Authentication

API key-based authentication. Each user receives a key in the format:

```
iks_live_abc123def456...
```

Keys are validated via `X-API-Key` header on all requests.

## Development

### Local Setup
```bash
cd cloud/
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Testing

The test suite includes comprehensive integration tests that exercise the full request lifecycle and catch real-world bugs.

#### Run All Tests
```bash
pytest tests/ -v
```

#### Run with Coverage Report
```bash
pytest tests/ --cov=app --cov-report=html --cov-report=term-missing
```

Coverage report will be generated in `htmlcov/index.html`.

#### Run Specific Test Categories
```bash
# Authentication tests
pytest tests/test_auth.py -v

# Integration tests (full workflows)
pytest tests/test_integration.py -v

# Unit tests (algorithms)
pytest tests/test_processor.py -v

# File upload and transform tests
pytest tests/test_transform.py -v
```

#### Test Coverage

The integration test suite covers:

- **Authentication flows**: Valid/invalid API keys, multi-tenant isolation
- **File validation**: File type, size limits, preset validation
- **End-to-end workflows**: Upload → Poll status → Download results
- **History & pagination**: User job history, sorting, limits
- **Concurrent processing**: Multiple users, multiple jobs
- **Error handling**: Invalid UUIDs, missing jobs, permission checks
- **API contract**: Response schemas, documented behavior

**Minimum coverage target**: 70% (enforced by pytest)

#### Writing Tests

When adding features or fixing bugs:

1. Add integration tests first (TDD approach)
2. Test both happy paths and error cases
3. Consider multi-tenant scenarios
4. Mock external dependencies when needed
5. Update coverage target if appropriate

### Docker Build
```bash
docker build -t inksight-cloud .
docker run -p 8000:8000 -e API_KEYS=iks_test_123 inksight-cloud
```

### Docker Compose (with Redis)
```bash
docker-compose up
```

## Deployment

### Railway
```bash
railway login
railway init
railway up
```

### Fly.io
```bash
fly launch
fly deploy
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_KEYS` | Comma-separated valid API keys | `""` |
| `STORAGE_DIR` | Directory for uploaded files | `/tmp/inksight` |
| `MAX_FILE_SIZE_MB` | Max upload size | `50` |
| `QUEUE_WORKERS` | Background workers | `2` |
| `LOG_LEVEL` | Logging level | `INFO` |

## Future Enhancements

- **Redis job queue** for multi-worker scalability
- **S3/R2 storage** for uploaded files and results
- **ML model integration** for AI-powered beautification
- **WebSocket support** for real-time progress updates
- **Stripe billing** integration
- **Rate limiting** per API key/tier
- **Monitoring** with Sentry

## License

Proprietary. See LICENSE file.
