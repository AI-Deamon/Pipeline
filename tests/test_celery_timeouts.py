import pytest
from app.core.celery_app import celery_app


class TestCeleryTimeouts:
    def test_global_time_limit_set(self):
        """Celery global task_time_limit is configured to 600s (10 min)."""
        assert celery_app.conf.task_time_limit == 600

    def test_global_soft_time_limit_set(self):
        """Celery global task_soft_time_limit is configured to 540s (9 min)."""
        assert celery_app.conf.task_soft_time_limit == 540

    def test_time_limits_are_overridable_per_task(self):
        """Individual tasks can override the global time limits via decorator."""
        from celery import shared_task

        @shared_task(time_limit=120, time_soft_limit=90)
        def custom_task():
            return True

        assert custom_task.time_limit == 120
        assert custom_task.time_soft_limit == 90
