import pytest
from pydantic import ValidationError
from app.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectGroupCreate,
)


class TestProjectCreateValidation:
    def test_empty_name_rejected(self):
        with pytest.raises(ValidationError, match="Name cannot be empty"):
            ProjectCreate(name="")

    def test_whitespace_only_name_rejected(self):
        with pytest.raises(ValidationError, match="Name cannot be empty"):
            ProjectCreate(name="   ")

    def test_name_over_255_chars_rejected(self):
        with pytest.raises(ValidationError, match="255 characters"):
            ProjectCreate(name="a" * 256)

    def test_valid_name_accepted(self):
        p = ProjectCreate(name="My Project")
        assert p.name == "My Project"

    def test_name_is_stripped(self):
        p = ProjectCreate(name="  My Project  ")
        assert p.name == "My Project"

    def test_git_url_without_protocol_rejected(self):
        with pytest.raises(ValidationError, match="Git URL must start with http"):
            ProjectCreate(name="p", git_url="example.com/repo")

    def test_git_url_over_2048_chars_rejected(self):
        with pytest.raises(ValidationError, match="2048 characters"):
            ProjectCreate(name="p", git_url="http://" + "a" * 2042)

    def test_valid_git_url_accepted(self):
        p = ProjectCreate(name="p", git_url="https://github.com/org/repo.git")
        assert p.git_url == "https://github.com/org/repo.git"

    def test_invalid_ip_rejected(self):
        with pytest.raises(ValidationError, match="Target IP"):
            ProjectCreate(name="p", target_ip="not-an-ip")

    def test_ip_with_too_many_octets_rejected(self):
        with pytest.raises(ValidationError, match="Target IP"):
            ProjectCreate(name="p", target_ip="1.2.3.4.5")

    def test_valid_ip_accepted(self):
        p = ProjectCreate(name="p", target_ip="192.168.1.1")
        assert p.target_ip == "192.168.1.1"

    def test_target_url_without_protocol_rejected(self):
        with pytest.raises(ValidationError, match="Target URL must start with http"):
            ProjectCreate(name="p", target_url="example.com")

    def test_valid_target_url_accepted(self):
        p = ProjectCreate(name="p", target_url="https://example.com/app")
        assert p.target_url == "https://example.com/app"

    def test_extra_fields_rejected(self):
        with pytest.raises(ValidationError):
            ProjectCreate(name="p", unknown_field="value")


class TestProjectGroupCreateValidation:
    def test_empty_group_name_rejected(self):
        with pytest.raises(ValidationError, match="Name cannot be empty"):
            ProjectGroupCreate(name="", naming_pattern="kilo_*")

    def test_group_name_over_255_chars_rejected(self):
        with pytest.raises(ValidationError, match="255 characters"):
            ProjectGroupCreate(name="a" * 256, naming_pattern="kilo_*")

    def test_naming_pattern_over_200_chars_rejected(self):
        with pytest.raises(ValidationError, match="200 characters"):
            ProjectGroupCreate(name="g", naming_pattern="a" * 201)

    def test_redos_pattern_rejected(self):
        with pytest.raises(ValidationError, match="unsafe regex"):
            ProjectGroupCreate(name="g", naming_pattern="(a*)*b")

    def test_nested_quantifier_rejected(self):
        with pytest.raises(ValidationError, match="unsafe regex"):
            ProjectGroupCreate(name="g", naming_pattern="(.*)*")

    def test_valid_group_accepted(self):
        g = ProjectGroupCreate(name="Frontend", naming_pattern="frontend_")
        assert g.name == "Frontend"
        assert g.naming_pattern == "frontend_"
