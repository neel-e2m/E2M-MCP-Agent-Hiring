"""
Analytics service — dashboard metrics.

Provides aggregated data for the HR dashboard overview.
"""

from supabase import Client

from app.core.logging_config import get_logger

logger = get_logger(__name__)


class AnalyticsService:
    """Data aggregation and reporting."""

    def __init__(self, supabase: Client):
        self.supabase = supabase

    async def get_overview(self) -> dict:
        """Fetch high-level KPI counts — all queries run concurrently."""
        import asyncio

        def _q_candidates():
            return self.supabase.table("candidates").select("id", count="exact").execute()

        def _q_roles():
            return self.supabase.table("roles").select("id", count="exact").eq("is_active", True).execute()

        def _q_apps():
            return self.supabase.table("applications").select("id", count="exact").execute()

        def _q_reviews():
            return self.supabase.table("applications").select("id", count="exact").eq("status", "submitted").execute()

        def _q_scores():
            return self.supabase.table("screening_sessions").select("total_score").eq("status", "completed").execute()

        candidates, roles, apps, reviews, scores_res = await asyncio.gather(
            asyncio.to_thread(_q_candidates),
            asyncio.to_thread(_q_roles),
            asyncio.to_thread(_q_apps),
            asyncio.to_thread(_q_reviews),
            asyncio.to_thread(_q_scores),
        )

        scores = [s["total_score"] for s in (scores_res.data or []) if s["total_score"] is not None]
        avg_score = sum(scores) / len(scores) if scores else 0.0

        return {
            "total_candidates": candidates.count or 0,
            "active_roles": roles.count or 0,
            "pending_reviews": reviews.count or 0,
            "total_applications": apps.count or 0,
            "avg_screening_score": round(avg_score, 2),
        }

    async def get_pipeline(self) -> dict:
        """Count applications by status for funnel visualization."""
        # We can use the Supabase JS client's ability to group or just fetch statuses
        # For simplicity here, we fetch and group in memory (fine for small scale)
        result = self.supabase.table("applications").select("status").execute()
        
        counts = {
            "submitted": 0,
            "under_review": 0,
            "shortlisted": 0,
            "approved": 0,
            "rejected": 0,
        }
        
        for app in (result.data or []):
            status = app.get("status")
            if status in counts:
                counts[status] += 1
                
        return counts

    async def get_screening_scores(self) -> dict:
        """Bucket screening scores for distribution charts."""
        result = self.supabase.table("screening_sessions").select("total_score").eq("status", "completed").execute()
        
        buckets = {"0-2": 0, "2-4": 0, "4-6": 0, "6-8": 0, "8-10": 0}
        
        for session in (result.data or []):
            score = session.get("total_score")
            if score is None:
                continue
                
            if score < 2: buckets["0-2"] += 1
            elif score < 4: buckets["2-4"] += 1
            elif score < 6: buckets["4-6"] += 1
            elif score < 8: buckets["6-8"] += 1
            else: buckets["8-10"] += 1
            
        return buckets

    async def get_recent_activity(self, limit: int = 10) -> list[dict]:
        """Fetch a unified timeline of recent events."""
        result = (
            self.supabase.table("applications")
            .select("id, status, submitted_at, reviewed_at, candidates(name), roles(title)")
            .order("submitted_at", desc=True)
            .limit(limit * 2)
            .execute()
        )
        
        activity = []
        for app in (result.data or []):
            name = app.get("candidates", {}).get("name", "Unknown")
            role = app.get("roles", {}).get("title", "Unknown role")
            
            if app.get("submitted_at"):
                activity.append({
                    "id": f"sub_{app['id']}",
                    "type": "application",
                    "message": f"{name} applied for {role}",
                    "timestamp": app["submitted_at"],
                })
                
            if app.get("reviewed_at") and app.get("status") != "submitted":
                status = app["status"]
                activity.append({
                    "id": f"rev_{app['id']}",
                    "type": status,
                    "message": f"{name}'s application was {status.replace('_', ' ')}",
                    "timestamp": app["reviewed_at"],
                })
                
        activity.sort(key=lambda x: x["timestamp"], reverse=True)
        return activity[:limit]
