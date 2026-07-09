"""
LLM service — Groq integration.

Handles all AI operations: screening evaluation, resume parsing,
profile summarization, and application recommendations.
"""

import json
from typing import Any

from groq import AsyncGroq

from app.config import get_settings
from app.core.logging_config import get_logger

settings = get_settings()
logger = get_logger(__name__)


class LLMService:
    """Wrapper for Groq API interactions."""

    def __init__(self):
        # We initialise the client only if the API key is present
        self.api_key = settings.GROQ_API_KEY
        self.model = settings.GROQ_MODEL
        self.client = AsyncGroq(api_key=self.api_key) if self.api_key else None
        
        if not self.api_key:
            logger.warning("groq_api_key_missing", msg="LLM operations will return mocked responses.")

    async def _call_llm(self, system_prompt: str, user_prompt: str, json_mode: bool = False) -> str:
        """Internal helper to call Groq API."""
        if not self.client:
            return self._mock_response(system_prompt, json_mode)

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"} if json_mode else {"type": "text"},
                temperature=0.1 if json_mode else 0.7,
                max_tokens=2048,
            )
            return response.choices[0].message.content or ""
        except Exception as exc:
            logger.error("llm_call_failed", error=str(exc))
            raise

    def _mock_response(self, system_prompt: str, json_mode: bool) -> str:
        """Return dummy responses for development without API key."""
        if json_mode:
            if "evaluate" in system_prompt.lower():
                return '{"score": 7.5, "feedback": "Good answer, covers the basics.", "strengths": ["Clear"], "improvements": ["Needs more detail"]}'
            elif "resume" in system_prompt.lower():
                return '{"skills": ["Python", "AI"], "experience": ["Software Engineer"], "education": ["BSc CS"]}'
            return "{}"
        return "This is a mocked AI response due to missing Groq API key."

    async def evaluate_answer(self, question: str, answer: str, role_context: str = "") -> dict[str, Any]:
        """Evaluate a candidate's answer to a screening question.
        
        Returns a dict containing 'score' (0-10), 'feedback', 'strengths', 'improvements'.
        """
        system_prompt = f"""
        You are an expert technical interviewer evaluating a candidate for an AI Engineering role.
        Role Context: {role_context}
        
        You will be given a question and the candidate's answer.
        Evaluate the answer based on correctness, depth of understanding, and clarity.
        
        Provide your response as a JSON object with the following structure:
        {{
            "score": <float 0-10>,
            "feedback": "<detailed constructive feedback addressed directly to the candidate>",
            "strengths": ["<strength 1>", "<strength 2>"],
            "improvements": ["<area for improvement 1>"]
        }}
        """
        
        user_prompt = f"Question: {question}\n\nCandidate's Answer:\n{answer}"
        
        response_text = await self._call_llm(system_prompt, user_prompt, json_mode=True)
        try:
            return json.loads(response_text)
        except json.JSONDecodeError:
            logger.error("llm_json_parse_failed", response=response_text)
            return {"score": 0.0, "feedback": "Error parsing evaluation."}

    async def generate_profile_summary(self, candidate_data: dict) -> str:
        """Generate a concise professional summary based on profile data."""
        system_prompt = "You are a professional resume writer. Create a concise, 3-4 sentence professional summary based on the provided candidate data."
        user_prompt = json.dumps(candidate_data, default=str)
        return await self._call_llm(system_prompt, user_prompt)

    async def generate_recommendation(self, application_data: dict) -> str:
        """Generate a hire/no-hire recommendation with reasoning."""
        system_prompt = """
        You are a senior hiring manager. Review the application data, including screening scores and profile, 
        and provide a brief recommendation (Hire, Strong Hire, No Hire, Needs Interview) with a short 2-3 sentence justification.
        """
        user_prompt = json.dumps(application_data, default=str)
        return await self._call_llm(system_prompt, user_prompt)

    async def extract_resume_data(self, resume_text: str) -> dict[str, Any]:
        """Extract structured data from raw resume text."""
        system_prompt = """
        Extract information from the provided resume text.
        Return ONLY a JSON object with this structure:
        {
            "skills": ["<skill1>", "<skill2>"],
            "experience": ["<job 1 description>", "<job 2 description>"],
            "education": ["<degree 1>", "<degree 2>"],
            "certifications": ["<cert 1>"],
            "summary": "<brief summary>"
        }
        """
        response_text = await self._call_llm(system_prompt, resume_text, json_mode=True)
        try:
            return json.loads(response_text)
        except json.JSONDecodeError:
            logger.error("llm_resume_parse_failed", response=response_text)
            return {}
