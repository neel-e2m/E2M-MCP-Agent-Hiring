"""
Eligibility service — deterministic, HR-defined rule checks.

Evaluates a candidate's **structured profile** (skills / experience / education
provided via ``update_profile``) against the eligibility rules configured on a
role (``roles.screening_config.eligibility_rules``).

No AI is involved: every check is deterministic and transparent, returning the
required value, the candidate's actual value, and a pass/fail flag so HR (and the
candidate's agent) can see exactly why a candidate was gated out.
"""

from datetime import datetime, timezone

from supabase import Client

from app.core.logging_config import get_logger
from app.services.llm_service import LLMService

logger = get_logger(__name__)

# Higher rank = more advanced qualification.
EDUCATION_RANK = {
    "any": 0,
    "high_school": 1,
    "associate": 2,
    "bachelor": 3,
    "master": 4,
    "phd": 5,
}

_RANK_LABEL = {0: "none", 1: "high_school", 2: "associate", 3: "bachelor", 4: "master", 5: "phd"}


def _education_level_from_text(text: str) -> int:
    """Map a free-text degree string to an education rank."""
    t = (text or "").lower()
    if any(k in t for k in ("phd", "ph.d", "doctor", "d.phil")):
        return 5
    if any(k in t for k in ("master", "m.sc", "msc", "m.s.", "m.tech", "mtech", "mba", "post grad", "postgrad")):
        return 4
    if any(k in t for k in ("bachelor", "b.sc", "bsc", "b.s.", "b.tech", "btech", "b.e", "be(", "undergrad", "integrated")):
        return 3
    if any(k in t for k in ("associate", "diploma")):
        return 2
    if any(k in t for k in ("high school", "secondary", "12th", "hsc", "10th")):
        return 1
    return 0


class EligibilityService:
    """Deterministic eligibility evaluation against HR-defined role rules."""

    def __init__(self, supabase: Client):
        self.supabase = supabase

    async def evaluate(self, candidate_id: str, role_id: str) -> dict:
        """Fetch the candidate profile + role rules and evaluate eligibility."""
        candidate = (
            self.supabase.table("candidates").select("*").eq("id", candidate_id).single().execute().data
        )
        role = (
            self.supabase.table("roles").select("screening_config").eq("id", role_id).single().execute().data
        )
        rules = ((role or {}).get("screening_config") or {}).get("eligibility_rules") or {}
        result = self.evaluate_profile(candidate or {}, rules)
        
        custom_rules = rules.get("custom_rules")
        if custom_rules and result.get("eligible"):
            resume_text = (candidate or {}).get("resume_text", "")
            if resume_text:
                llm = LLMService()
                custom_eval = await llm.evaluate_custom_eligibility(resume_text, custom_rules)
                if not custom_eval.get("passed", True):
                    result["eligible"] = False
                    result["reasons"].append(f"Custom rule failed: {custom_eval.get('reason', 'Does not meet custom requirements.')}")
                    result["checks"].append({
                        "rule": "custom_rules",
                        "required": custom_rules,
                        "actual": custom_eval.get("reason", "Failed"),
                        "passed": False
                    })
                else:
                    result["checks"].append({
                        "rule": "custom_rules",
                        "required": custom_rules,
                        "actual": "Passed",
                        "passed": True
                    })
        
        logger.info("eligibility_evaluated", candidate_id=candidate_id, role_id=role_id, eligible=result["eligible"])
        return result

    def evaluate_profile(self, candidate: dict, rules: dict) -> dict:
        """Pure evaluation of a candidate dict against a rules dict."""
        checks: list[dict] = []

        # ── Minimum experience (years) ──
        min_exp = rules.get("min_experience_years")
        try:
            min_exp_val = float(min_exp) if min_exp not in (None, "") else 0.0
        except (TypeError, ValueError):
            min_exp_val = 0.0
        if min_exp_val > 0:
            actual = self._total_experience_years(candidate.get("experience") or [])
            checks.append({
                "rule": "min_experience_years",
                "required": min_exp_val,
                "actual": round(actual, 1),
                "passed": actual >= min_exp_val,
            })

        # ── Minimum education ──
        min_edu = rules.get("min_education")
        if min_edu and min_edu != "any":
            actual_rank = self._highest_education(candidate.get("education") or [])
            checks.append({
                "rule": "min_education",
                "required": min_edu,
                "actual": _RANK_LABEL.get(actual_rank, "none"),
                "passed": actual_rank >= EDUCATION_RANK.get(min_edu, 0),
            })

        # ── Required skills ──
        required_skills = [s for s in (rules.get("required_skills") or []) if str(s).strip()]
        if required_skills:
            have = {str(s).strip().lower() for s in (candidate.get("skills") or []) if isinstance(s, str)}
            missing = [s for s in required_skills if str(s).strip().lower() not in have]
            checks.append({
                "rule": "required_skills",
                "required": required_skills,
                "actual": ("missing: " + ", ".join(missing)) if missing else "all present",
                "passed": len(missing) == 0,
            })

        eligible = all(c["passed"] for c in checks) if checks else True
        reasons = [self._reason(c) for c in checks if not c["passed"]]
        return {"eligible": eligible, "reasons": reasons, "checks": checks}

    # ── Helpers ──────────────────────────────────────────────────────────

    def _total_experience_years(self, experience: list) -> float:
        total_months = 0.0
        for e in experience:
            if not isinstance(e, dict):
                continue
            start = self._parse_date(e.get("start_date"))
            if not start:
                continue
            end = self._parse_date(e.get("end_date")) or datetime.now(timezone.utc)
            months = (end.year - start.year) * 12 + (end.month - start.month)
            total_months += max(0, months)
        return total_months / 12.0

    @staticmethod
    def _parse_date(value) -> datetime | None:
        if not value:
            return None
        s = str(value).strip()
        if s.lower() in ("present", "current", "now", "ongoing"):
            return None  # treated as "now" by the caller
        for fmt in ("%Y-%m-%d", "%Y-%m", "%Y/%m/%d", "%Y/%m", "%m/%Y", "%b %Y", "%B %Y", "%Y"):
            try:
                return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        return None

    def _highest_education(self, education: list) -> int:
        best = 0
        for e in education:
            if isinstance(e, dict):
                text = " ".join(str(e.get(k, "")) for k in ("degree", "field", "level"))
            else:
                text = str(e)
            best = max(best, _education_level_from_text(text))
        return best

    @staticmethod
    def _reason(c: dict) -> str:
        rule = c["rule"]
        if rule == "min_experience_years":
            return f"Requires at least {c['required']} year(s) of experience (found {c['actual']})."
        if rule == "min_education":
            return f"Requires at least a {c['required']} degree (found {c['actual']})."
        if rule == "required_skills":
            return f"Missing required skill(s) — {c['actual']}."
        return "Does not meet a requirement."
