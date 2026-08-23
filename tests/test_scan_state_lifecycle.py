"""Every scan state must be classified as exactly one of active or terminal.

A state that is neither (like SKIPPED used to be) is treated as "active forever"
by expiry/recovery logic — a latent stuck-scan bug.
"""

import pytest

from app.api.scans.utils import ACTIVE_STATES, TERMINAL_STATES
from app.state.scan_state import ScanState


@pytest.mark.parametrize("state", list(ScanState))
def test_every_state_is_active_xor_terminal(state):
    is_active = state in ACTIVE_STATES
    is_terminal = state in TERMINAL_STATES
    assert is_active != is_terminal, (
        f"{state} must be exactly one of active/terminal "
        f"(active={is_active}, terminal={is_terminal})"
    )


def test_string_values_match_enum_membership():
    # last_scan_state is stored as a plain string column; str-Enum hashing must
    # keep membership checks working for raw strings.
    assert "RUNNING" in ACTIVE_STATES
    assert "SKIPPED" in TERMINAL_STATES
    assert "COMPLETED" not in ACTIVE_STATES
