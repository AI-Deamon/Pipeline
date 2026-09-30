# DevSecOps Scan Pipeline

Runs security scanners against projects, normalises what they report, and turns it into reports and trackable work.

## Language

**Finding**:
One problem reported by a scanner, normalised by a parser and stored in a Scan Report.
_Avoid_: Vulnerability, alert, result

**Issue**:
A tracked record derived from a Finding, with a lifecycle (open, fixed, regressed, verified).
_Avoid_: Ticket, finding (when the lifecycle matters)
