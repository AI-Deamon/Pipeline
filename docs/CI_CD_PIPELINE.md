# CI/CD Deployment Pipeline

This document defines the automated pipeline for deploying the DevSecOps Scanning Platform. The pipeline ensures that all components are deployed in the correct order to maintain system integrity.

## Deployment Order
1. **Backend API & Database** (Primary Source of Truth)
2. **Jenkins Controller** (Orchestration Hub)
3. **Kali Execution Agent** (Tool Plane)
4. **Web UI** (Consumer of APIs)

## Pipeline Definition (Groovy)

```groovy
pipeline {
    agent { label 'master' }

    stages {
        stage('Prepare') {
            steps {
                echo 'Checking out platform source code...'
                checkout scm
            }
        }

        stage('Deploy Backend') {
            steps {
                echo 'Building and deploying Backend API...'
                // Implementation details for Backend deployment
                sh 'cd backend && docker build -t security-platform-backend .'
                sh 'docker-compose up -d backend-api db'
            }
        }

        stage('Deploy Jenkins Controller') {
            steps {
                echo 'Provisioning Jenkins Controller...'
                // Implementation details for Jenkins deployment
                sh 'docker-compose up -d jenkins'
            }
        }

        stage('Deploy Kali Agent') {
            steps {
                echo 'Provisioning isolated Kali Linux execution agent...'
                // Implementation details for Kali agent deployment
                sh 'ssh agent-host "docker run -d --name kali-agent kali-linux-security-agent"'
            }
        }

        stage('Deploy UI') {
            steps {
                echo 'Building and deploying Frontend UI...'
                // Implementation details for UI deployment
                sh 'npm install && npm run build'
                sh 'docker build -t security-platform-ui -f ui.Dockerfile .'
                sh 'docker-compose up -d nginx-ui'
            }
        }

        stage('Integration Validation') {
            steps {
                echo 'Running end-to-end integration tests...'
                sh 'export PYTHONPATH=$PYTHONPATH:$(pwd)/backend && python -m pytest tests/test_integration.py'
            }
        }
    }

    post {
        success {
            echo 'Security platform deployed successfully.'
        }
        failure {
            echo 'Deployment failed. Commencing rollback protocols.'
        }
    }
}
```

## Rollback Protocol
If any stage fails, the pipeline stops immediately. Rollback involves reverting to the last tagged stable container images for each respective component.
