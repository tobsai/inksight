"""API key authentication middleware."""

from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader

from .config import settings

# Security scheme for API key in header
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str = Security(api_key_header)) -> str:
    """Verify that the provided API key is valid.
    
    Args:
        api_key: API key from X-API-Key header
        
    Returns:
        The validated API key
        
    Raises:
        HTTPException: 401 if key is missing or invalid
    """
    valid_keys = settings.get_valid_api_keys()
    
    if not valid_keys:
        # Development mode: no keys configured, allow all requests
        return "dev_mode"
    
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key. Provide X-API-Key header.",
        )
    
    if api_key not in valid_keys:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )
    
    return api_key


def get_user_id_from_key(api_key: str) -> str:
    """Extract user ID from API key.
    
    For MVP, we use the API key itself as the user ID.
    In production, this would look up the user in a database.
    """
    return api_key
