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
        self.template_id_submitted = settings.EMAILJS_TEMPLATE_ID_SUBMITTED
        self.template_id_status = settings.EMAILJS_TEMPLATE_ID_STATUS
        self.public_key = settings.EMAILJS_PUBLIC_KEY
        self.private_key = settings.EMAILJS_PRIVATE_KEY
        self.api_url = "https://api.emailjs.com/api/v1.0/email/send"

    async def _send_email(self, template_params: dict, override_template_id: str | None = None) -> bool:
        """Internal helper to call EmailJS API."""
        if not self.service_id or not self.public_key:
            logger.warning("emailjs_config_missing", msg="Emails will not be sent.")
            return False
            
        target_template_id = override_template_id or self.template_id
        if not target_template_id:
            logger.warning("emailjs_template_missing", msg="Template ID is missing, skipping email.")
            return False

        payload = {
            "service_id": self.service_id,
            "template_id": target_template_id,
            "user_id": self.public_key,
            "accessToken": self.private_key,
            "template_params": template_params,
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(self.api_url, json=payload)
                if response.status_code != 200:
                    logger.error("email_send_failed", status_code=response.status_code, details=response.text)
                response.raise_for_status()
                logger.info("email_sent_successfully")
                return True
        except Exception as exc:
            logger.error("email_send_exception", error=str(exc))
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

    async def send_application_submitted(self, to_email: str, candidate_name: str, role_title: str, status: str) -> bool:
        """Notify candidate that their application was submitted successfully."""
        params = {
            "to_email": to_email,
            "to_name": candidate_name,
            "role_title": role_title,
            "status": status,
        }
        return await self._send_email(params, override_template_id=self.template_id_submitted)

    async def send_status_update(self, to_email: str, candidate_name: str, status: str) -> bool:
        """Notify candidate of an application status change."""
        params = {
            "to_email": to_email,
            "to_name": candidate_name,
            "status": status,
        }
        return await self._send_email(params, override_template_id=self.template_id_status)

    async def send_interview_schedule(self, to_email: str, details: dict) -> bool:
        """Send interview scheduling details."""
        params = {
            "to_email": to_email,
            "type": "interview",
            **details,
        }
        return await self._send_email(params)
