"""
Storage service — Supabase Storage operations.

Wraps the supabase.storage client for safe file uploads, downloads,
and signed URL generation.
"""

from supabase import Client

from app.core.logging_config import get_logger

logger = get_logger(__name__)


class StorageService:
    """Operations for Supabase Storage buckets."""

    def __init__(self, supabase: Client):
        self.supabase = supabase

    async def upload_file(self, bucket: str, path: str, content: bytes, content_type: str) -> str:
        """Upload a file to a bucket.

        Args:
            bucket: Bucket name (e.g., 'resumes').
            path: Target path (e.g., 'candidate_id/resume.pdf').
            content: Raw file bytes.
            content_type: MIME type.

        Returns:
            The storage path used.
        """
        try:
            self.supabase.storage.from_(bucket).upload(
                file=content,
                path=path,
                file_options={"content-type": content_type, "upsert": "true"}
            )
            logger.info("file_uploaded", bucket=bucket, path=path)
            return path
        except Exception as exc:
            logger.error("file_upload_failed", bucket=bucket, path=path, error=str(exc))
            raise

    async def get_signed_url(self, bucket: str, path: str, expires: int = 3600) -> str:
        """Generate a temporary signed URL for downloading a file."""
        try:
            response = self.supabase.storage.from_(bucket).create_signed_url(path, expires)
            return response.get("signedURL", "")
        except Exception as exc:
            logger.error("signed_url_generation_failed", bucket=bucket, path=path, error=str(exc))
            return ""

    async def delete_file(self, bucket: str, path: str) -> None:
        """Delete a file from a bucket."""
        try:
            self.supabase.storage.from_(bucket).remove([path])
            logger.info("file_deleted", bucket=bucket, path=path)
        except Exception as exc:
            logger.error("file_deletion_failed", bucket=bucket, path=path, error=str(exc))

    async def list_files(self, bucket: str, folder: str = "") -> list:
        """List files in a bucket folder."""
        try:
            return self.supabase.storage.from_(bucket).list(folder)
        except Exception as exc:
            logger.error("file_list_failed", bucket=bucket, folder=folder, error=str(exc))
            return []
