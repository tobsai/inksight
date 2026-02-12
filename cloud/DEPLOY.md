# InkSight Cloud Deployment Guide

## Local Development

### Setup
```bash
cd cloud/
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
```

### Run Locally
```bash
# Set environment variables
export API_KEYS="iks_dev_test123"
export LOG_LEVEL="DEBUG"

# Run with auto-reload
uvicorn app.main:app --reload --port 8000
```

### Run with Docker Compose
```bash
docker-compose up
```

The API will be available at http://localhost:8000

API docs: http://localhost:8000/docs

## Testing

### Run Tests
```bash
pytest tests/ -v
```

### Test Coverage
```bash
pytest tests/ --cov=app --cov-report=html
open htmlcov/index.html
```

### Manual API Testing
```bash
# Upload a file
curl -X POST http://localhost:8000/transform \
  -H "X-API-Key: iks_dev_test123" \
  -F "file=@test.rm" \
  -F "preset=medium"

# Check status (replace JOB_ID with the returned job_id)
curl http://localhost:8000/status/JOB_ID \
  -H "X-API-Key: iks_dev_test123"

# Get history
curl http://localhost:8000/transforms \
  -H "X-API-Key: iks_dev_test123"
```

## Production Deployment

### Railway

1. **Install Railway CLI**
```bash
npm install -g @railway/cli
railway login
```

2. **Create Project**
```bash
railway init
railway link
```

3. **Set Environment Variables**
```bash
railway variables set API_KEYS="iks_live_abc123,iks_live_def456"
railway variables set LOG_LEVEL="INFO"
railway variables set STORAGE_DIR="/data"
```

4. **Deploy**
```bash
railway up
```

5. **Add Persistent Volume** (optional)
- Go to Railway dashboard
- Add volume mounted at `/data` for persistent storage

### Fly.io

1. **Install Fly CLI**
```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

2. **Initialize App**
```bash
fly launch
```

3. **Set Secrets**
```bash
fly secrets set API_KEYS="iks_live_abc123,iks_live_def456"
fly secrets set LOG_LEVEL="INFO"
```

4. **Deploy**
```bash
fly deploy
```

5. **Add Volume** (optional)
```bash
fly volumes create inksight_data --size 10
# Update fly.toml to mount volume at /data
fly deploy
```

### Docker Hub

1. **Build and Tag**
```bash
docker build -t yourusername/inksight-cloud:latest .
docker tag yourusername/inksight-cloud:latest yourusername/inksight-cloud:0.1.0
```

2. **Push**
```bash
docker login
docker push yourusername/inksight-cloud:latest
docker push yourusername/inksight-cloud:0.1.0
```

3. **Run**
```bash
docker run -d \
  -p 8000:8000 \
  -e API_KEYS="iks_live_abc123" \
  -e LOG_LEVEL="INFO" \
  -v /var/inksight:/data \
  yourusername/inksight-cloud:latest
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEYS` | Yes* | `""` | Comma-separated valid API keys |
| `CORS_ORIGINS` | No | `"*"` | Allowed CORS origins |
| `STORAGE_DIR` | No | `/tmp/inksight` | File storage directory |
| `MAX_FILE_SIZE_MB` | No | `50` | Maximum upload size in MB |
| `QUEUE_WORKERS` | No | `2` | Number of background workers |
| `JOB_TIMEOUT_SECONDS` | No | `300` | Job timeout (5 minutes) |
| `LOG_LEVEL` | No | `INFO` | Logging level |
| `HOST` | No | `0.0.0.0` | Server host |
| `PORT` | No | `8000` | Server port |

\* If `API_KEYS` is not set, the API runs in development mode (no auth)

## Monitoring

### Health Checks
```bash
curl http://your-api.com/health
```

### Logs
```bash
# Railway
railway logs

# Fly.io
fly logs

# Docker
docker logs CONTAINER_ID
```

### Metrics
Consider adding:
- Sentry for error tracking
- Prometheus for metrics
- Grafana for dashboards

## Scaling

### Horizontal Scaling
For multi-instance deployments, replace the in-memory queue with Redis:

1. Add Redis to your infrastructure
2. Update `app/services/queue.py` to use Redis
3. Add Celery workers for background processing

### Vertical Scaling
- Increase `QUEUE_WORKERS` for more concurrent processing
- Allocate more CPU/memory to the container
- Use GPU-enabled instances for future ML model integration

## Security

### Production Checklist
- [ ] Use HTTPS (enable via reverse proxy or platform)
- [ ] Restrict CORS origins (set `CORS_ORIGINS` to specific domains)
- [ ] Rotate API keys regularly
- [ ] Enable rate limiting (add middleware)
- [ ] Set up monitoring and alerts
- [ ] Configure backups for storage volume
- [ ] Review and update dependencies regularly

### API Key Management
- Generate keys with: `python -c "import secrets; print('iks_live_' + secrets.token_hex(16))"`
- Store keys securely (environment variables, secrets manager)
- Never commit keys to version control
- Implement key rotation policy

## Troubleshooting

### Common Issues

**"Missing API key" error**
- Ensure `X-API-Key` header is set
- Verify the key is in the `API_KEYS` environment variable

**File upload fails**
- Check `MAX_FILE_SIZE_MB` setting
- Verify file is a valid `.rm` file
- Check available disk space

**Jobs stuck in "queued"**
- Check logs for processing errors
- Verify background queue processor is running
- Increase `JOB_TIMEOUT_SECONDS` if needed

**Out of disk space**
- Implement cleanup job for old files
- Increase storage volume size
- Move to S3/R2 for cloud storage

## Next Steps

### Future Enhancements
1. **Redis + Celery** for distributed job queue
2. **S3/R2 storage** for scalable file storage
3. **ML model integration** for AI-powered beautification
4. **WebSocket support** for real-time progress updates
5. **Stripe billing** integration
6. **Rate limiting** per API key/tier
7. **Web dashboard** for user management
8. **OCR pipeline** for handwriting-to-text

See the main README for roadmap and feature plans.
