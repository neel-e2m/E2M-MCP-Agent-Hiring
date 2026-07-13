"""
Application-wide enums and constants.

Every status field, category, or fixed-choice value used across the
application is defined here as a ``str`` enum so it can be serialised
to JSON and compared with plain strings.
"""

from enum import Enum


class ApplicationStatus(str, Enum):
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    SHORTLISTED = "shortlisted"
    APPROVED = "approved"
    REJECTED = "rejected"


class ProfileStatus(str, Enum):
    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"


class TokenType(str, Enum):
    INVITE = "invite"
    SESSION = "session"


class ScreeningStatus(str, Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ABANDONED = "abandoned"


class UserRole(str, Enum):
    ADMIN = "admin"
    HR_MANAGER = "hr_manager"
    RECRUITER = "recruiter"


class QuestionCategory(str, Enum):
    MCP = "mcp"
    RAG = "rag"
    AGENTS = "agents"
    LLM = "llm"
    SYSTEM_DESIGN = "system_design"
    GENERAL = "general"


class QuestionDifficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class Speaker(str, Enum):
    AI = "ai"
    CANDIDATE = "candidate"
    SYSTEM = "system"


class FileType(str, Enum):
    RESUME = "resume"
    PORTFOLIO = "portfolio"
    LINKEDIN_PDF = "linkedin_pdf"
    OTHER = "other"


class InterviewStatus(str, Enum):
    SCHEDULED = "scheduled"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    RESCHEDULED = "rescheduled"
