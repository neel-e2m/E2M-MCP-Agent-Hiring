"""
Email service — EmailJS integration.

Sends invitation emails and status updates to candidates.
"""

import httpx

from app.config import get_settings
from app.core.logging_config import get_logger

settings = get_settings()
logger = get_logger(__name__)


class EmailService:
    """Send emails using EmailJS REST API."""

    def __init__(self):
        self.service_id = settings.EMAILJS_SERVICE_ID
        self.template_id = settings.EMAILJS_TEMPLATE_ID
        self.public_key = settings.EMAILJS_PUBLIC_KEY
        self.private_key = settings.EMAILJS_PRIVATE_KEY
        self.api_url = "https://api.emailjs.com/api/v1.0/email/send"

    async def _send_email(self, template_params: dict) -> bool:
        """Internal helper to call EmailJS API."""
        if not self.service_id or not self.public_key:
            logger.warning("emailjs_config_missing", msg="Emails will not be sent.")
            return False

        payload = {
            "service_id": self.service_id,
            "template_id": self.template_id,
            "user_id": self.public_key,
            "accessToken": self.private_key,
            "template_params": template_params,
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(self.api_url, json=payload)
                response.raise_for_status()
                logger.info("email_sent_successfully")
                return True
        except Exception as exc:
            logger.error("email_send_failed", error=str(exc))
            return False

    async def send_invite(
        self, to_email: str, candidate_name: str, role_title: str, token: str, mcp_server_url: str
    ) -> bool:
        """Send an invite token to a candidate."""
        params = {
            "to_email": to_email,
            "to_name": candidate_name or "Candidate",
            "role_title": role_title,
            "invite_token": token,
            "server_url": mcp_server_url,
            "type": "invite",
        }
        return await self._send_email(params)

    async def send_status_update(self, to_email: str, candidate_name: str, status: str) -> bool:
        """Notify candidate of an application status change."""
        params = {
            "to_email": to_email,
            "to_name": candidate_name,
            "status": status,
            "type": "status_update",
        }
        return await self._send_email(params)

    async def send_interview_schedule(self, to_email: str, details: dict) -> bool:
        """Send interview scheduling details."""
        params = {
            "to_email": to_email,
            "type": "interview",
            **details,
        }
        return await self._send_email(params)
