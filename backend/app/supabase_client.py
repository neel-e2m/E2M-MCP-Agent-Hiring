"""
Supabase client initialization.

Provides a configured Supabase client using the service-role key for
backend admin operations.  Use ``get_supabase()`` as a FastAPI dependency.
"""

from functools import lru_cache

from supabase import Client, create_client

from app.config import get_settings


def _create_supabase_client() -> Client:
    """Create a Supabase admin client (service-role key).
    
    WARNING: Do not cache this client as a singleton (e.g. using @lru_cache).
    The supabase-py client is stateful; calling auth methods like sign_in_with_password
    mutates the client's internal headers. Caching it globally will cause race conditions
    and overwrite the service-role Authorization header with user JWTs, leading to RLS errors.
    """
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

def get_supabase() -> Client:
    """FastAPI dependency — returns the Supabase admin client."""
    return _create_supabase_client()
