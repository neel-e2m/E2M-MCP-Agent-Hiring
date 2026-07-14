"""
APScheduler configuration for background tasks.
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.memory import MemoryJobStore
from app.core.logging_config import get_logger

logger = get_logger(__name__)

jobstores = {
    'default': MemoryJobStore()
}

scheduler = AsyncIOScheduler(jobstores=jobstores)

def start_scheduler():
    """Start the APScheduler."""
    if not scheduler.running:
        scheduler.start()
        logger.info("apscheduler_started")

def shutdown_scheduler():
    """Shutdown the APScheduler."""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("apscheduler_shutdown")
