import pytest
from app.state.issue_state import IssueState, TRANSITIONS, is_valid_transition


class TestIssueStateEnum:
    def test_states_unique(self):
        values = [s.value for s in IssueState]
        assert len(values) == len(set(values))

    def test_state_count(self):
        assert len(IssueState) == 7


class TestIssueTransitions:
    def test_open_to_assigned(self):
        assert is_valid_transition(IssueState.OPEN, IssueState.ASSIGNED)

    def test_open_to_anything_else(self):
        for state in IssueState:
            if state == IssueState.ASSIGNED:
                continue
            assert not is_valid_transition(IssueState.OPEN, state), f"open -> {state} should be invalid"

    def test_assigned_to_in_progress(self):
        assert is_valid_transition(IssueState.ASSIGNED, IssueState.IN_PROGRESS)

    def test_in_progress_to_fixed(self):
        assert is_valid_transition(IssueState.IN_PROGRESS, IssueState.FIXED)

    def test_fixed_to_verified(self):
        assert is_valid_transition(IssueState.FIXED, IssueState.VERIFIED)

    def test_fixed_to_rejected(self):
        assert is_valid_transition(IssueState.FIXED, IssueState.REJECTED)

    def test_verified_only_regression_transition(self):
        # VERIFIED is terminal EXCEPT for a regression reopen (VERIFIED -> OPEN), which
        # exists so detect_regressions can go through the state machine instead of
        # writing issue.status directly.
        assert TRANSITIONS[IssueState.VERIFIED] == {IssueState.OPEN}

    def test_verified_to_open_regression(self):
        assert is_valid_transition(IssueState.VERIFIED, IssueState.OPEN)

    def test_fixed_to_open_regression(self):
        assert is_valid_transition(IssueState.FIXED, IssueState.OPEN)

    def test_rejected_to_assigned(self):
        assert is_valid_transition(IssueState.REJECTED, IssueState.ASSIGNED)

    def test_invalid_transition(self):
        assert not is_valid_transition(IssueState.OPEN, IssueState.VERIFIED)
        assert not is_valid_transition(IssueState.ASSIGNED, IssueState.VERIFIED)
        # A verified issue can only reopen (regression); it cannot jump straight to
        # any other state.
        assert not is_valid_transition(IssueState.VERIFIED, IssueState.ASSIGNED)

    def test_valid_full_cycle(self):
        states = [
            IssueState.OPEN,
            IssueState.ASSIGNED,
            IssueState.IN_PROGRESS,
            IssueState.FIXED,
            IssueState.REJECTED,
            IssueState.ASSIGNED,
            IssueState.IN_PROGRESS,
            IssueState.FIXED,
            IssueState.VERIFIED,
        ]
        for i in range(len(states) - 1):
            assert is_valid_transition(states[i], states[i + 1]), (
                f"{states[i].value} -> {states[i+1].value} should be valid"
            )
