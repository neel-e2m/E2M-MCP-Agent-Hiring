"""
Resume service — file processing and parsing.

Coordinates file upload to Supabase Storage and triggers LLM-based
parsing to extract structured data from resumes.
"""

import base64

from supabase import Client

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging_config import get_logger
from app.services.storage_service import StorageService

logger = get_logger(__name__)

MAX_RESUME_BYTES = 5 * 1024 * 1024  # 5 MB


class ResumeService:
    """Resume upload and parsing operations."""

    def __init__(self, supabase: Client):
        self.supabase = supabase
        self.storage = StorageService(supabase)

    async def upload(self, candidate_id: str, file_content: bytes, filename: str, content_type: str) -> dict:
        """Upload a resume and create a record.

        Returns:
            The created candidate_files record.
        """
        # Upload to Supabase Storage
        path = f"{candidate_id}/{filename}"
        await self.storage.upload_file("resumes", path, file_content, content_type)

        # Create candidate_files record
        result = self.supabase.table("candidate_files").insert({
            "candidate_id": candidate_id,
            "file_type": "resume",
            "file_name": filename,
            "storage_path": path,
            "mime_type": content_type,
            "file_size": len(file_content),
        }).execute()

        file_record = result.data[0]
        logger.info("resume_uploaded", candidate_id=candidate_id, file_id=file_record["id"])

        # Note: Background task for parsing would be triggered here in a Celery-enabled environment
        # e.g., parse_resume_async.delay(file_record["id"])

        return file_record

    async def upload_base64(self, candidate_id: str, file_base64: str, filename: str = "resume.pdf") -> dict:
        """Decode a base64-encoded PDF sent by the candidate's agent and store it.

        The candidate's AI agent submits the real PDF as base64 (optionally a
        ``data:`` URL). We keep a single resume per candidate so the dashboard
        always shows the latest one.
        """
        payload = (file_base64 or "").strip()
        if payload.startswith("data:") and "," in payload:
            payload = payload.split(",", 1)[1]

        try:
            content = base64.b64decode(payload, validate=False)
        except Exception as exc:  # noqa: BLE001
            raise ValidationError(detail="Invalid base64 resume content") from exc

        if not content:
            raise ValidationError(detail="Resume file is empty")
        if len(content) > MAX_RESUME_BYTES:
            raise ValidationError(detail="Resume exceeds the 5 MB limit")

        safe_name = (filename or "resume.pdf").strip() or "resume.pdf"
        if not safe_name.lower().endswith(".pdf"):
            safe_name = f"{safe_name}.pdf"

        # Ensure the bucket exists and clear any previous resume records for this candidate
        await self.storage.ensure_bucket("resumes")
        self.supabase.table("candidate_files").delete().eq(
            "candidate_id", candidate_id
        ).eq("file_type", "resume").execute()

        return await self.upload(candidate_id, content, safe_name, "application/pdf")

    async def update_parsed_data(self, file_id: str, parsed_data: dict) -> None:
        """Update the parsed data for a resume file."""
        self.supabase.table("candidate_files").update({
            "parsed_data": parsed_data
        }).eq("id", file_id).execute()

        # Also update the candidate profile with extracted skills/experience if missing
        file_record = (
            self.supabase.table("candidate_files")
            .select("candidate_id")
            .eq("id", file_id)
            .single()
            .execute()
        )
        if file_record.data:
            candidate_id = file_record.data["candidate_id"]
            
            # Simple strategy: append extracted skills if any
            if skills := parsed_data.get("skills"):
                # Fetch existing candidate
                candidate = (
                    self.supabase.table("candidates")
                    .select("skills")
                    .eq("id", candidate_id)
                    .single()
                    .execute()
                )
                if candidate.data:
                    existing_skills = candidate.data.get("skills") or []
                    if isinstance(existing_skills, str):
                        existing_skills = [existing_skills]
                    
                    # Merge and deduplicate
                    all_skills = list(set(existing_skills + (skills if isinstance(skills, list) else [skills])))
                    
                    self.supabase.table("candidates").update({
                        "skills": all_skills
                    }).eq("id", candidate_id).execute()

    async def get_parsed_data(self, candidate_id: str) -> dict:
        """Fetch the parsed resume data for a candidate."""
        result = (
            self.supabase.table("candidate_files")
            .select("parsed_data")
            .eq("candidate_id", candidate_id)
            .eq("file_type", "resume")
            .order("uploaded_at", desc=True)
            .limit(1)
            .execute()
        )
        if not result.data:
            raise NotFoundError(detail="No resume found for this candidate")
            
        return result.data[0].get("parsed_data") or {}

    async def upload_url(self, candidate_id: str, url: str) -> dict:
        """Download a resume PDF from a public URL and store it."""
        import httpx
        from urllib.parse import urlparse
        import os
        
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                content = response.content
        except Exception as exc:
            raise ValidationError(detail=f"Failed to download resume from URL: {str(exc)}") from exc

        if not content:
            raise ValidationError(detail="Downloaded resume file is empty")
        if len(content) > MAX_RESUME_BYTES:
            raise ValidationError(detail="Resume exceeds the 5 MB limit")

        # Try to infer filename from URL or headers
        filename = "resume.pdf"
        parsed = urlparse(url)
        basename = os.path.basename(parsed.path)
        if basename and basename.lower().endswith(".pdf"):
            filename = basename
        elif "content-disposition" in response.headers:
            cd = response.headers["content-disposition"]
            if "filename=" in cd:
                filename = cd.split("filename=")[1].strip('"\'')
        
        if not filename.lower().endswith(".pdf"):
            filename = f"{filename}.pdf"

        # Ensure the bucket exists and clear any previous resume records for this candidate
        await self.storage.ensure_bucket("resumes")
        self.supabase.table("candidate_files").delete().eq(
            "candidate_id", candidate_id
        ).eq("file_type", "resume").execute()

        return await self.upload(candidate_id, content, filename, "application/pdf")
