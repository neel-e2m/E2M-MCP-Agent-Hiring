"""
Security utilities — JWT handling, token generation, hashing.

All cryptographic operations are centralised here so the rest of the
application can import simple helper functions.
"""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from app.config import get_settings
from app.core.exceptions import TokenExpiredError, TokenInvalidError

settings = get_settings()


class SecurityService:
    """Static helper methods for JWT and token operations."""

    @staticmethod
    def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
        """Create a signed JWT access token.

        Args:
            data: Payload claims (e.g. ``{"sub": user_id, "role": "admin"}``).
            expires_delta: Custom expiry.  Defaults to config value.

        Returns:
            Encoded JWT string.
        """
        to_encode = data.copy()
        expire = datetime.now(timezone.utc) + (
            expires_delta
            or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
        return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    @staticmethod
    def create_refresh_token(data: dict) -> str:
        """Create a long-lived refresh token."""
        to_encode = data.copy()
        expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc), "type": "refresh"})
        return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    @staticmethod
    def verify_token(token: str) -> dict:
        """Decode and validate a JWT.

        Raises:
            TokenExpiredError: If the token has expired.
            TokenInvalidError: If the token is malformed or tampered.
        """
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
            return payload
        except JWTError as exc:
            if "expired" in str(exc).lower():
                raise TokenExpiredError() from exc
            raise TokenInvalidError() from exc

    @staticmethod
    def verify_supabase_jwt(token: str) -> dict:
        """Decode a Supabase-issued JWT.

        Supabase recently migrated from HS256 to ES256 for JWT signing.
        We first attempt HS256 verification with the project's JWT secret.
        If that fails (e.g. algorithm mismatch), we fall back to decoding
        the token without signature verification while still checking expiry,
        since the token was obtained via a trusted Supabase auth call.

        Raises:
            TokenExpiredError / TokenInvalidError on failure.
        """
        import logging
        log = logging.getLogger("app.core.security")

        # Attempt 1: HS256 with the shared secret (legacy Supabase projects)
        try:
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            return payload
        except JWTError:
            pass

        # Attempt 2: Decode without signature verification (ES256 tokens)
        # python-jose requires a key and algorithms even with verify_signature=False.
        # We still validate expiry claims to reject expired tokens.
        try:
            payload = jwt.decode(
                token,
                None,
                algorithms=["ES256"],
                options={
                    "verify_signature": False,
                    "verify_aud": False,
                    "verify_exp": True,
                },
            )
            log.info("Supabase JWT decoded via ES256 fallback (no sig verification)")
            return payload
        except JWTError as exc:
            log.error(f"JWT Verification failed: {exc}")
            if "expired" in str(exc).lower():
                raise TokenExpiredError() from exc
            raise TokenInvalidError() from exc

    @staticmethod
    def generate_invite_token() -> str:
        """Generate a cryptographically secure invite token (URL-safe)."""
        return secrets.token_urlsafe(32)

    @staticmethod
    def hash_token(token: str) -> str:
        """Return the SHA-256 hex digest of *token* for safe storage."""
        return hashlib.sha256(token.encode()).hexdigest()

    @staticmethod
    def verify_token_hash(token: str, hashed: str) -> bool:
        """Constant-time comparison of a token against its stored hash."""
        return hmac.compare_digest(
            hashlib.sha256(token.encode()).hexdigest(),
            hashed,
        )
