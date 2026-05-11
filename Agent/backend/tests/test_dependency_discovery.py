import pytest
from unittest.mock import Mock, patch, MagicMock
from app.services.dependency_discovery_service import DependencyDiscoveryService
import tempfile
import os
import shutil


class TestDependencyDiscoveryService:
    """Unit tests for DependencyDiscoveryService"""

    @pytest.fixture
    def service(self):
        """Create service instance for testing"""
        return DependencyDiscoveryService()

    @pytest.fixture
    def mock_repo_dir(self):
        """Create a mock repository structure for testing"""
        temp_dir = tempfile.mkdtemp()
        
        # Create npm project structure
        npm_dir = os.path.join(temp_dir, "frontend")
        os.makedirs(npm_dir)
        with open(os.path.join(npm_dir, "package.json"), "w") as f:
            f.write('{"name": "test-frontend", "version": "1.0.0"}')
        
        # Create Python project structure
        py_dir = os.path.join(temp_dir, "backend")
        os.makedirs(py_dir)
        with open(os.path.join(py_dir, "requirements.txt"), "w") as f:
            f.write("fastapi==0.100.0\npytest==7.0.0")
        
        # Create nested npm project
        services_dir = os.path.join(temp_dir, "services")
        os.makedirs(services_dir)
        web_dir = os.path.join(services_dir, "web")
        os.makedirs(web_dir)
        with open(os.path.join(web_dir, "package.json"), "w") as f:
            f.write('{"name": "test-web", "version": "1.0.0"}')
        
        yield temp_dir
        
        # Cleanup
        shutil.rmtree(temp_dir)

    def test_discover_npm_projects(self, service, mock_repo_dir):
        """Test detection of npm package.json files"""
        result = service._find_files(mock_repo_dir, "npm")
        assert len(result) == 2
        assert any("frontend/package.json" in f for f in result)
        assert any("services/web/package.json" in f for f in result)

    def test_discover_pip_projects(self, service, mock_repo_dir):
        """Test detection of requirements.txt files"""
        result = service._find_files(mock_repo_dir, "pip")
        assert len(result) == 1
        assert "backend/requirements.txt" in result[0]

    def test_discover_excludes_node_modules(self, service, mock_repo_dir):
        """Test that node_modules directories are excluded"""
        # Create node_modules with package.json
        node_modules_dir = os.path.join(mock_repo_dir, "node_modules", "pkg")
        os.makedirs(node_modules_dir)
        with open(os.path.join(node_modules_dir, "package.json"), "w") as f:
            f.write('{}')
        
        result = service._find_files(mock_repo_dir, "npm")
        # Should still be 2 (frontend and services/web), not 3
        assert len(result) == 2
        assert not any("node_modules" in f for f in result)

    def test_discover_excludes_venv(self, service, mock_repo_dir):
        """Test that venv directories are excluded"""
        # Create venv with requirements.txt
        venv_dir = os.path.join(mock_repo_dir, "venv", "lib")
        os.makedirs(venv_dir)
        with open(os.path.join(venv_dir, "requirements.txt"), "w") as f:
            f.write("some-package==1.0.0")
        
        result = service._find_files(mock_repo_dir, "pip")
        # Should still be 1 (backend), not 2
        assert len(result) == 1
        assert not any("venv" in f for f in result)

    def test_discover_no_maven_projects(self, service, mock_repo_dir):
        """Test detection when no Maven projects exist"""
        result = service._find_files(mock_repo_dir, "maven")
        assert len(result) == 0

    def test_discover_no_gradle_projects(self, service, mock_repo_dir):
        """Test detection when no Gradle projects exist"""
        result = service._find_files(mock_repo_dir, "gradle")
        assert len(result) == 0

    def test_make_relative(self, service, mock_repo_dir):
        """Test conversion of absolute paths to relative paths"""
        absolute_path = os.path.join(mock_repo_dir, "frontend", "package.json")
        relative = service._make_relative(absolute_path, mock_repo_dir)
        assert relative == "./frontend/package.json"

    def test_make_relative_with_backslashes(self, service, mock_repo_dir):
        """Test path normalization on Windows-style paths"""
        # Simulate Windows path
        absolute_path = os.path.join(mock_repo_dir, "frontend", "package.json")
        relative = service._make_relative(absolute_path, mock_repo_dir)
        # Should always use forward slashes
        assert "\\" not in relative
        assert relative.startswith("./")

    @patch('app.services.dependency_discovery_service.git_client')
    def test_discover_full_flow(self, mock_git_client, service, mock_repo_dir):
        """Test full discovery flow with mocked git client"""
        # Mock the git client to return our test directory
        mock_git_client.clone_repository.return_value = mock_repo_dir
        
        result = service.discover("https://github.com/test/repo.git", "main")
        
        # Verify results
        assert len(result.npm) == 2
        assert len(result.pip) == 1
        assert len(result.maven) == 0
        assert len(result.gradle) == 0
        
        # Verify paths are relative
        assert all(path.startswith("./") for path in result.npm)
        assert all(path.startswith("./") for path in result.pip)
        
        # Verify cleanup was called
        mock_git_client.cleanup.assert_called_once()

    @patch('app.services.dependency_discovery_service.git_client')
    def test_discover_cleanup_on_error(self, mock_git_client, service):
        """Test that cleanup is called even when discovery fails"""
        mock_git_client.clone_repository.side_effect = Exception("Clone failed")
        
        with pytest.raises(Exception):
            service.discover("https://github.com/test/repo.git", "main")
        
        # Verify cleanup was still called
        mock_git_client.cleanup.assert_called_once()


class TestDependencyPatterns:
    """Test dependency file pattern matching"""

    @pytest.fixture
    def service(self):
        return DependencyDiscoveryService()

    @pytest.fixture
    def complex_repo(self):
        """Create a complex repository with multiple dependency types"""
        temp_dir = tempfile.mkdtemp()
        
        # Root level package.json
        with open(os.path.join(temp_dir, "package.json"), "w") as f:
            f.write('{}')
        
        # Maven project
        java_dir = os.path.join(temp_dir, "java")
        os.makedirs(java_dir)
        with open(os.path.join(java_dir, "pom.xml"), "w") as f:
            f.write('<project></project>')
        
        # Gradle project
        android_dir = os.path.join(temp_dir, "android")
        os.makedirs(android_dir)
        with open(os.path.join(android_dir, "build.gradle"), "w") as f:
            f.write('plugins {}')
        
        # Gradle Kotlin DSL
        with open(os.path.join(android_dir, "build.gradle.kts"), "w") as f:
            f.write('plugins {}')
        
        # Dev requirements
        with open(os.path.join(temp_dir, "requirements-dev.txt"), "w") as f:
            f.write('pytest')
        
        yield temp_dir
        shutil.rmtree(temp_dir)

    def test_discover_all_types(self, service, complex_repo):
        """Test discovery of all dependency types"""
        npm = service._find_files(complex_repo, "npm")
        pip = service._find_files(complex_repo, "pip")
        maven = service._find_files(complex_repo, "maven")
        gradle = service._find_files(complex_repo, "gradle")
        
        assert len(npm) == 1
        assert len(pip) == 2  # requirements.txt and requirements-dev.txt
        assert len(maven) == 1
        assert len(gradle) == 2  # build.gradle and build.gradle.kts
