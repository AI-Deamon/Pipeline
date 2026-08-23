from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "devsecops_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.jenkins_tasks",
        "app.tasks.report_tasks",
        "app.tasks.cleanup_tasks",
        "app.tasks.issue_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=600,        # 10 min hard kill
    task_soft_time_limit=540,   # 9 min graceful SoftTimeLimitExceeded
    # finding #17: a hard SIGKILL bypasses a task's own retry logic entirely, and by
    # default Celery acks (removes from the queue) *before* execution — so a killed
    # task is gone, not requeued. acks_late + reject_on_worker_lost make the broker
    # redeliver a task that never finished (worker killed, crashed, OOM'd) instead of
    # silently losing it. Tasks must therefore be idempotent on redelivery — already
    # true here (fetcher.py's report upserts delete-then-insert per (scan_id,
    # tool_name), confirmed safe under retry in the earlier concurrency review).
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)

# finding #16: cleanup_expired_reports' docstring claimed "runs daily at 3 AM" but
# nothing ever scheduled it — no beat_schedule existed, and no `celery beat` process
# was launched anywhere. Scheduled here; the celery_worker container needs `-B`
# (embedded beat) added to its command for this to actually fire — see
# docker/docker-compose.yml. Embedded beat (not a separate beat service) is
# appropriate while there's a single worker replica; if celery_worker is ever scaled
# to multiple replicas, this needs to move to its own single-instance beat service to
# avoid double-scheduling.
celery_app.conf.beat_schedule = {
    "cleanup-expired-reports-daily": {
        "task": "app.tasks.cleanup_tasks.cleanup_expired_reports",
        "schedule": crontab(hour=3, minute=0),
    },
}
