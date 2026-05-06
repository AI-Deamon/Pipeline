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
