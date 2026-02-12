"""FastAPI application entry point for InkSight Cloud."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import settings
from .routes import api_router

# Configure logging
logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger("inksight")

# Create FastAPI app
app = FastAPI(
    title="InkSight Cloud API",
    description="Multi-tenant SaaS for AI-powered handwriting improvement on reMarkable tablets",
    version=__version__,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router)


@app.on_event("startup")
async def startup_event():
    """Run on application startup."""
    logger.info(f"Starting InkSight Cloud API v{__version__}")
    logger.info(f"Storage directory: {settings.storage_dir}")
    logger.info(f"Max file size: {settings.max_file_size_mb}MB")
    
    # Ensure storage directory exists
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    
    # Log API key status
    valid_keys = settings.get_valid_api_keys()
    if valid_keys:
        logger.info(f"Loaded {len(valid_keys)} valid API keys")
    else:
        logger.warning("No API keys configured - running in development mode")


@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown."""
    logger.info("Shutting down InkSight Cloud API")


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "InkSight Cloud API",
        "version": __version__,
        "status": "operational",
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring."""
    return {
        "status": "healthy",
        "version": __version__,
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level=settings.log_level.lower(),
    )
