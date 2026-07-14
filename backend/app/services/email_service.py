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
        # Account 1
        self.service_id = settings.EMAILJS_SERVICE_ID
        self.template_id = settings.EMAILJS_TEMPLATE_ID
        self.template_id_submitted = settings.EMAILJS_TEMPLATE_ID_SUBMITTED
        self.template_id_status = settings.EMAILJS_TEMPLATE_ID_STATUS
        self.public_key = settings.EMAILJS_PUBLIC_KEY
        self.private_key = settings.EMAILJS_PRIVATE_KEY
        
        # Account 2 (Interviews)
        self.service_id_2 = settings.EMAILJS2_SERVICE_ID
        self.template_id_interview_candidate = settings.EMAILJS2_TEMPLATE_ID_INTERVIEW_CANDIDATE
        self.template_id_interview_interviewer = settings.EMAILJS2_TEMPLATE_ID_INTERVIEW_INTERVIEWER
        self.public_key_2 = settings.EMAILJS2_PUBLIC_KEY
        self.private_key_2 = settings.EMAILJS2_PRIVATE_KEY
        
        self.api_url = "https://api.emailjs.com/api/v1.0/email/send"

    async def _send_email(self, template_params: dict, override_template_id: str | None = None, use_account_2: bool = False) -> bool:
        """Internal helper to call EmailJS API."""
        svc_id = self.service_id_2 if use_account_2 else self.service_id
        pub_key = self.public_key_2 if use_account_2 else self.public_key
        priv_key = self.private_key_2 if use_account_2 else self.private_key
        
        if not svc_id or not pub_key:
            logger.warning("emailjs_config_missing", msg="Emails will not be sent.")
            return False
            
        target_template_id = override_template_id or self.template_id
        if not target_template_id:
            logger.warning("emailjs_template_missing", msg="Template ID is missing, skipping email.")
            return False

        payload = {
            "service_id": svc_id,
            "template_id": target_template_id,
            "user_id": pub_key,
            "accessToken": priv_key,
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

    async def send_interview_to_candidate(self, to_email: str, candidate_name: str, role_title: str, interviewer_name: str, scheduled_time: str, meeting_link: str) -> bool:
        """Notify candidate of their scheduled interview."""
        params = {
            "to_email": to_email,
            "to_name": candidate_name,
            "role_title": role_title,
            "interviewer_name": interviewer_name,
            "scheduled_time": scheduled_time,
            "meeting_link": meeting_link,
            "reminder_text": "This is a confirmation of your scheduled interview."
        }
        return await self._send_email(params, override_template_id=self.template_id_interview_candidate, use_account_2=True)

    async def send_interview_to_interviewer(self, to_email: str, interviewer_name: str, candidate_name: str, role_title: str, scheduled_time: str, meeting_link: str) -> bool:
        """Notify interviewer of their scheduled interview."""
        params = {
            "to_email": to_email,
            "to_name": interviewer_name,
            "candidate_name": candidate_name,
            "role_title": role_title,
            "scheduled_time": scheduled_time,
            "meeting_link": meeting_link,
            "reminder_text": "This is a new interview assigned to you."
        }
        return await self._send_email(params, override_template_id=self.template_id_interview_interviewer, use_account_2=True)

    async def send_interview_reminder(self, to_email: str, to_name: str, role_title: str, scheduled_time: str, meeting_link: str, is_candidate: bool) -> bool:
        """Send a 15-minute reminder."""
        params = {
            "to_email": to_email,
            "to_name": to_name,
            "role_title": role_title,
            "scheduled_time": scheduled_time,
            "meeting_link": meeting_link,
            "reminder_text": "REMINDER: Your interview starts in 15 minutes!"
        }
        # Use the appropriate template
        template_id = self.template_id_interview_candidate if is_candidate else self.template_id_interview_interviewer
        return await self._send_email(params, override_template_id=template_id, use_account_2=True)
