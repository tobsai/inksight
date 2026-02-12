"""API route handlers for InkSight Cloud."""

from fastapi import APIRouter

from .history import router as history_router
from .status import router as status_router
from .transform import router as transform_router

# Combine all routers
api_router = APIRouter()
api_router.include_router(transform_router, tags=["transform"])
api_router.include_router(status_router, tags=["status"])
api_router.include_router(history_router, tags=["history"])

__all__ = ["api_router"]
