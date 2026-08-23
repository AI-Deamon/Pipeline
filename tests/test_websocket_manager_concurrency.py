"""Regression test for #98: ConnectionManager broadcast methods iterated the live
mutable connection set across `await` points. A client disconnecting mid-broadcast
mutates that same set from disconnect(), raising `RuntimeError: Set changed size
during iteration` on resume. Also covers send_scan_update's tier isolation — one
tier's broadcast failing must not skip the others.
"""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JENKINS_BASE_URL", "http://jenkins.test")
os.environ.setdefault("STORAGE_PATH", "/tmp/sentinel-test-storage")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("ENVIRONMENT", "test")

import asyncio

import pytest

from app.websockets.manager import ConnectionManager


class _FakeWebSocket:
    """A connection whose send_json disconnects a sibling connection mid-broadcast,
    simulating a real client dropping while another send is in flight."""

    def __init__(self, manager: ConnectionManager, scan_id: str, disconnect_target=None):
        self._manager = manager
        self._scan_id = scan_id
        self._disconnect_target = disconnect_target

    async def send_json(self, message):
        if self._disconnect_target is not None:
            # Simulate the target disconnecting while this send is "in flight" —
            # mutates manager.scan_connections[scan_id] mid-iteration.
            self._manager.disconnect(self._disconnect_target, scan_id=self._scan_id)


@pytest.mark.asyncio
async def test_disconnect_during_broadcast_does_not_raise():
    manager = ConnectionManager()
    scan_id = "scan-concurrent"
    manager.scan_connections[scan_id] = set()

    target = _FakeWebSocket(manager, scan_id)
    trigger = _FakeWebSocket(manager, scan_id, disconnect_target=target)

    manager.scan_connections[scan_id].add(target)
    manager.scan_connections[scan_id].add(trigger)

    # Must not raise RuntimeError: Set changed size during iteration.
    await manager.broadcast_to_scan(scan_id, {"event": "test"})


@pytest.mark.asyncio
async def test_send_scan_update_delivers_to_remaining_tiers_when_one_fails():
    manager = ConnectionManager()

    async def _raise(*_args, **_kwargs):
        raise RuntimeError("scan tier boom")

    project_called = asyncio.Event()

    async def _project_ok(*_args, **_kwargs):
        project_called.set()

    manager.broadcast_to_scan = _raise
    manager.broadcast_to_project = _project_ok
    manager.broadcast_global = _project_ok

    # Must not raise, and the remaining tiers must still run.
    await manager.send_scan_update("scan-1", "proj-1", {"state": "COMPLETED"})
    assert project_called.is_set()
