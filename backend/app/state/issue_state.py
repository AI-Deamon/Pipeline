from enum import Enum


class IssueState(str, Enum):
    OPEN = "open"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    FIXED = "fixed"
    PENDING_VERIFICATION = "pending_verification"
    VERIFIED = "verified"
    REJECTED = "rejected"


TRANSITIONS: dict[IssueState, set[IssueState]] = {
    IssueState.OPEN: {IssueState.ASSIGNED},
    IssueState.ASSIGNED: {IssueState.IN_PROGRESS},
    IssueState.IN_PROGRESS: {IssueState.FIXED},
    IssueState.FIXED: {
        IssueState.PENDING_VERIFICATION,
        IssueState.VERIFIED,
        IssueState.REJECTED,
    },
    IssueState.PENDING_VERIFICATION: {
        IssueState.VERIFIED,
        IssueState.REJECTED,
        IssueState.IN_PROGRESS,
    },
    IssueState.REJECTED: {IssueState.ASSIGNED},
    IssueState.VERIFIED: set(),
}


def is_valid_transition(from_state: IssueState, to_state: IssueState) -> bool:
    return to_state in TRANSITIONS.get(from_state, set())
