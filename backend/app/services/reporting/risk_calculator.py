"""
Risk Score Calculator for Security Reports
Generates 0-100 score (100 = perfectly secure)
"""
from typing import Dict, Tuple

class RiskCalculator:
    """Calculate risk score based on severity counts"""
    
    # Weights for each severity level
    WEIGHTS = {
        "critical": 15,
        "high": 10,
        "medium": 5,
        "low": 1,
        "info": 0,
    }
    
    def calculate(self, severity: Dict[str, int]) -> int:
        """
        Calculate risk score (0-100).
        100 = perfectly secure (no findings)
        0 = maximum risk (many critical findings)
        """
        total_weight = 0
        for level, count in severity.items():
            weight = self.WEIGHTS.get(level.lower(), 0)
            total_weight += count * weight
        
        # Score = 100 - weighted sum (capped at 0)
        score = max(0, 100 - total_weight)
        return min(100, score)
    
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
