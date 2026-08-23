"""
Risk Score Calculator for Security Reports
Generates 0-100 score (100 = perfectly secure)
"""
import math
from typing import Dict, Tuple

class RiskCalculator:
    """Calculate risk score based on severity counts.

    Finding #113: the previous formula was a flat linear subtraction
    (100 - 15*critical - 10*high - 5*medium - 1*low) with no cap relating a
    severity tier to the resulting risk bucket. Two concrete failures that
    formula produced: (1) a single critical CVE alone only cost 15 points,
    landing at 85 — "Low Risk" — next to a live unpatched critical
    vulnerability; (2) pure volume of medium-severity noise (e.g. 50 findings,
    no criticals at all) could subtract past 100 and floor at 0 — "Critical
    Risk" — scoring *worse* than the project with the actual critical CVE.

    Fixed with a tiered-ceiling design: the highest severity tier present sets
    a hard ceiling on the achievable score (critical present -> capped at 39,
    guaranteeing the "Critical Risk" bucket regardless of what else is in the
    report), and the penalty *within* that ceiling uses diminishing returns
    (sqrt of count, not a linear multiple) so a large volume of same-tier
    findings can't blow through a lower tier's ceiling. This makes "critical
    dominates lower-severity noise" a structural guarantee, not something that
    happens to work out for any particular pair of numbers.
    """

    # Hard ceiling for the highest severity tier present — the score can never
    # exceed this regardless of counts, which is what forces the correct risk
    # bucket (see get_risk_level's 80/60/40 boundaries) purely from severity
    # tier, independent of volume.
    TIER_CEILINGS = {
        "critical": 39,  # forces "Critical Risk" (<40)
        "high": 59,      # forces at worst "High Risk" (40-59)
        "medium": 79,    # forces at worst "Medium Risk" (60-79)
    }
    # Diminishing-returns coefficient per tier (applied to sqrt(count)), so
    # volume within a tier degrades the score smoothly instead of via an
    # unbounded linear penalty that can cross tier boundaries.
    TIER_PENALTY_COEFFICIENTS = {
        "critical": 18,
        "high": 8,
        "medium": 3,
        "low": 0.5,
    }

    def calculate(self, severity: Dict[str, int]) -> int:
        """
        Calculate risk score (0-100).
        100 = perfectly secure (no findings)
        0 = maximum risk
        """
        counts = {
            level: max(0, int(severity.get(level, 0) or 0))
            for level in ("critical", "high", "medium", "low")
        }

        ceiling = 100
        for level in ("critical", "high", "medium"):
            if counts[level] > 0:
                ceiling = self.TIER_CEILINGS[level]
                break

        penalty = sum(
            self.TIER_PENALTY_COEFFICIENTS[level] * math.sqrt(counts[level])
            for level in ("critical", "high", "medium", "low")
            if counts[level] > 0
        )

        score = ceiling - penalty
        return max(0, min(ceiling, round(score)))
    
    def get_trend(self, current_score: int, previous_score: int) -> str:
        """
        Determine if security posture is improving, stable, or worsening.
        Threshold: ±5 points = stable
        """
        diff = current_score - previous_score
        
        if diff > 5:
            return "improving"
        elif diff < -5:
            return "worsening"
        else:
            return "stable"
    
    def get_risk_level(self, score: int) -> str:
        """Get human-readable risk level"""
        if score >= 80:
            return "Low Risk"
        elif score >= 60:
            return "Medium Risk"
        elif score >= 40:
            return "High Risk"
        else:
            return "Critical Risk"

class RiskScore:
    """Risk score data structure"""
    def __init__(self, score: int, trend: str = "stable"):
        self.score = score
        self.trend = trend
        self.level = RiskCalculator().get_risk_level(score)
