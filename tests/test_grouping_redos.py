import pytest

from app.services.project_grouping import ProjectGroupingService


class TestRedosPrevention:
    def test_legitimate_fnmatch_pattern_works(self):
        score = ProjectGroupingService.calculate_match_confidence("frontend_*", "frontend_app")
        assert score == 100

    def test_evil_nested_quantifier_returns_zero(self):
        score = ProjectGroupingService.calculate_match_confidence("(a*)*b", "test")
        assert score == 0

    def test_evil_dot_star_quantifier_returns_zero(self):
        score = ProjectGroupingService.calculate_match_confidence("(.*)*", "test")
        assert score == 0

    def test_overly_long_pattern_returns_zero(self):
        score = ProjectGroupingService.calculate_match_confidence("a" * 201, "test")
        assert score == 0

    def test_max_length_boundary_works(self):
        score = ProjectGroupingService.calculate_match_confidence("a" * 200, "test")
        assert isinstance(score, int)

    def test_legitimate_regex_returns_confidence(self):
        score = ProjectGroupingService.calculate_match_confidence("kilo_re", "kilo_frontend")
        assert score > 0

    def test_regex_fallback_to_fuzzy_on_invalid(self):
        score = ProjectGroupingService.calculate_match_confidence("[invalid", "test")
        assert isinstance(score, int)
