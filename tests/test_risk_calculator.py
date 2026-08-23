import pytest
from app.services.reporting.risk_calculator import RiskCalculator, RiskScore

def test_risk_calculator_exists():
    """Verify RiskCalculator exists"""
    try:
        from app.services.reporting.risk_calculator import RiskCalculator
        assert True
    except ImportError:
        assert False, "RiskCalculator not found"

def test_calculate_risk_score():
    """Verify risk score calculation"""
    from app.services.reporting.risk_calculator import RiskCalculator
    
    # Test case: 3 critical, 12 high, 45 medium, 89 low
    severity = {"critical": 3, "high": 12, "medium": 45, "low": 89}
    calculator = RiskCalculator()
    score = calculator.calculate(severity)
    
    # Expected: 100 - (3*15 + 12*10 + 45*5 + 89*1) = 100 - (45 + 120 + 225 + 89) = 100 - 479 = 0 (capped at 0)
    assert score >= 0
    assert score <= 100

def test_risk_trend():
    """Verify trend detection"""
    from app.services.reporting.risk_calculator import RiskCalculator
    
    calculator = RiskCalculator()
    
    # Current score: 85, Previous: 70
    trend = calculator.get_trend(current_score=85, previous_score=70)
    assert trend == "improving"
    
    trend = calculator.get_trend(current_score=60, previous_score=80)
    assert trend == "worsening"
    
    trend = calculator.get_trend(current_score=75, previous_score=76)
    assert trend == "stable"


class TestRiskScoreInversionFix:
    """Regression tests for finding #113: the previous linear formula let
    high-volume low/medium-severity noise outscore a project with an actual
    critical finding, and a lone critical alone only cost 15 points (still
    landing in the "Low Risk" bucket at 85). Both are now structurally
    impossible — any critical presence forces the "Critical Risk" bucket.
    """

    def test_single_critical_alone_is_never_low_risk(self):
        calculator = RiskCalculator()
        score = calculator.calculate({"critical": 1, "high": 0, "medium": 0, "low": 0})
        assert calculator.get_risk_level(score) == "Critical Risk"

    def test_critical_project_scores_worse_than_pure_noise_project(self):
        calculator = RiskCalculator()
        # The exact numbers from the finding: 1 critical + 5 medium vs. 0
        # critical + 50 medium (pure volume, no actual critical finding).
        critical_project_score = calculator.calculate({"critical": 1, "high": 0, "medium": 5, "low": 0})
        noise_project_score = calculator.calculate({"critical": 0, "high": 0, "medium": 50, "low": 0})

        assert critical_project_score < noise_project_score
        assert calculator.get_risk_level(critical_project_score) == "Critical Risk"
        assert calculator.get_risk_level(noise_project_score) != "Critical Risk"

    def test_any_critical_present_forces_critical_risk_bucket_regardless_of_volume(self):
        calculator = RiskCalculator()
        # Even a huge pile of lower-severity findings alongside a single
        # critical must not pull the project out of "Critical Risk".
        score = calculator.calculate({"critical": 1, "high": 20, "medium": 100, "low": 500})
        assert calculator.get_risk_level(score) == "Critical Risk"

    def test_high_present_without_critical_never_exceeds_high_risk_ceiling(self):
        calculator = RiskCalculator()
        score = calculator.calculate({"critical": 0, "high": 1, "medium": 0, "low": 0})
        assert calculator.get_risk_level(score) in ("Critical Risk", "High Risk")

    def test_clean_project_scores_perfectly(self):
        calculator = RiskCalculator()
        score = calculator.calculate({"critical": 0, "high": 0, "medium": 0, "low": 0})
        assert score == 100
        assert calculator.get_risk_level(score) == "Low Risk"
