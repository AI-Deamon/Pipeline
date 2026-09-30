from app.services.reporting.parsers.base import SecurityFinding


def _finding(**overrides) -> SecurityFinding:
    defaults = dict(id="F1", tool="test", severity="High", title="T")
    defaults.update(overrides)
    return SecurityFinding(**defaults)


def test_location_prefers_file_path_and_line_number():
    f = _finding(file_path="src/app.ts", line_number=42, uri="https://example.com", host="h")
    assert f.location() == "src/app.ts:42"


def test_location_file_path_without_line_number():
    f = _finding(file_path="src/app.ts")
    assert f.location() == "src/app.ts"


def test_location_falls_back_to_uri_when_no_file_path():
    f = _finding(uri="https://example.com/app.js", host="h")
    assert f.location() == "https://example.com/app.js"


def test_location_falls_back_to_host_and_port():
    f = _finding(host="10.0.0.1", port=443, package="pkg")
    assert f.location() == "10.0.0.1:443"


def test_location_host_without_port():
    f = _finding(host="10.0.0.1")
    assert f.location() == "10.0.0.1"


def test_location_falls_back_to_package_and_version():
    f = _finding(package="lodash", package_version="4.17.15")
    assert f.location() == "lodash@4.17.15"


def test_location_package_without_version():
    f = _finding(package="lodash")
    assert f.location() == "lodash"


def test_location_dash_when_nothing_available():
    f = _finding()
    assert f.location() == "-"
