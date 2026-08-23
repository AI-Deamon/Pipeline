"""Regression tests for #16 (cleanup_expired_reports was never scheduled — no
beat_schedule existed) and #17 (hard task_time_limit SIGKILL bypassed retry logic
with no redelivery — acks_late/reject_on_worker_lost were unset)."""

import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_celery_config.db')
os.environ.setdefault('JENKINS_BASE_URL', 'http://localhost:8080')
os.environ.setdefault('JENKINS_TOKEN', 'test-token')
os.environ.setdefault('STORAGE_PATH', '/tmp/storage-test')
os.environ.setdefault('SCAN_TIMEOUT', '7200')
os.environ.setdefault('LOG_LEVEL', 'INFO')
os.environ.setdefault('CALLBACK_TOKEN', 'test-callback-token-1234567890')
os.environ.setdefault('API_KEY', 'test-api-key-1234567890')
os.environ.setdefault('MOCK_EXECUTION', 'True')

from app.core.celery_app import celery_app


def test_cleanup_expired_reports_is_scheduled():
    schedule = celery_app.conf.beat_schedule
    assert "cleanup-expired-reports-daily" in schedule
    entry = schedule["cleanup-expired-reports-daily"]
    assert entry["task"] == "app.tasks.cleanup_tasks.cleanup_expired_reports"


def test_tasks_are_redelivered_not_lost_on_worker_kill():
    assert celery_app.conf.task_acks_late is True
    assert celery_app.conf.task_reject_on_worker_lost is True
