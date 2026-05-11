#!/bin/bash
# =============================================================================
# DevSecOps Platform - Staging Setup Script
# =============================================================================
# This script sets up and runs the complete staging environment:
# - PostgreSQL database
# - FastAPI backend
# - Celery worker
# - React frontend (Vite)
#
# Prerequisites:
# - Docker & Docker Compose (for PostgreSQL only)
# - Python 3.10+
# - Node.js 18+
# - Jenkins running on localhost:8080
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# =============================================================================
# Configuration
# =============================================================================
export ENV="staging"
export DATABASE_URL="postgresql://devsecops:staging-password@localhost:5433/devsecops_staging"
export JENKINS_BASE_URL="http://localhost:8080"
export JENKINS_TOKEN="11f96de6d3b82596d6da461dcaf5c862f3"
export STORAGE_PATH="./storage/staging"
export SCAN_TIMEOUT="3600"
export LOG_LEVEL="INFO"
export DEBUG="false"
export MOCK_EXECUTION="false"
export CALLBACK_TOKEN="a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
export API_KEY="z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4"
export REDIS_URL="redis://localhost:6379/0"
export POSTGRES_DB="devsecops_staging"
export POSTGRES_USER="devsecops"
export POSTGRES_PASSWORD="staging-password"

# Ports
BACKEND_PORT=8000
FRONTEND_PORT=5173
POSTGRES_PORT=5433
REDIS_PORT=6379

# PID files
PID_DIR="./.pids"
BACKEND_PID="$PID_DIR/backend.pid"
CELERY_PID="$PID_DIR/celery.pid"
FRONTEND_PID="$PID_DIR/frontend.pid"

# =============================================================================
# Helper Functions
# =============================================================================
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_port() {
    local port=$1
    local service=$2
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        log_info "$service is already running on port $port"
        return 0
    else
        log_info "$service is NOT running on port $port"
        return 1
    fi
}

wait_for_service() {
    local host=$1
    local port=$2
    local service=$3
    local max_attempts=30
    local attempt=1

    log_info "Waiting for $service at $host:$port..."
    while ! nc -z "$host" "$port" 2>/dev/null; do
        if [ $attempt -ge $max_attempts ]; then
            log_error "$service failed to start after $max_attempts attempts"
            return 1
        fi
        sleep 1
        attempt=$((attempt + 1))
    done
    log_success "$service is ready!"
    return 0
}

cleanup() {
    log_info "Cleaning up..."
    
    # Kill background processes
    if [ -f "$BACKEND_PID" ]; then
        kill $(cat "$BACKEND_PID") 2>/dev/null || true
        rm -f "$BACKEND_PID"
    fi
    
    if [ -f "$CELERY_PID" ]; then
        kill $(cat "$CELERY_PID") 2>/dev/null || true
        rm -f "$CELERY_PID"
    fi
    
    if [ -f "$FRONTEND_PID" ]; then
        kill $(cat "$FRONTEND_PID") 2>/dev/null || true
        rm -f "$FRONTEND_PID"
    fi
    
    log_success "Cleanup complete"
}

# =============================================================================
# Main Setup
# =============================================================================
main() {
    echo "============================================================"
    echo "  DevSecOps Platform - Staging Setup"
    echo "============================================================"
    echo ""

    # Create directories
    log_info "Creating directories..."
    mkdir -p "$PID_DIR"
    mkdir -p "$STORAGE_PATH"
    mkdir -p "./storage/dev"
    mkdir -p "./storage/test"

    # Trap for cleanup on exit
    trap cleanup EXIT

    # =============================================================================
    # Step 1: Check Prerequisites
    # =============================================================================
    echo ""
    echo "============================================================"
    echo "  Step 1: Checking Prerequisites"
    echo "============================================================"

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    log_success "Docker is installed: $(docker --version)"

    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed."
        exit 1
    fi
    log_success "Docker Compose is available"

    # Check Python
    if ! command -v python3 &> /dev/null; then
        log_error "Python 3 is not installed."
        exit 1
    fi
    log_success "Python is installed: $(python3 --version)"

    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed."
        exit 1
    fi
    log_success "Node.js is installed: $(node --version)"

    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed."
        exit 1
    fi
    log_success "npm is installed: $(npm --version)"

    # Check Jenkins
    log_info "Checking Jenkins at $JENKINS_BASE_URL..."
    if curl -s -o /dev/null -w "%{http_code}" "$JENKINS_BASE_URL" | grep -q "200\|302\|403"; then
        log_success "Jenkins is running at $JENKINS_BASE_URL"
    else
        log_warning "Jenkins may not be accessible at $JENKINS_BASE_URL"
    fi

    # =============================================================================
    # Step 2: Start Infrastructure (PostgreSQL, Redis)
    # =============================================================================
    echo ""
    echo "============================================================"
    echo "  Step 2: Starting Infrastructure (PostgreSQL, Redis)"
    echo "============================================================"

    # Start PostgreSQL and Redis using Docker Compose
    log_info "Starting PostgreSQL and Redis containers..."
    
    cd "$SCRIPT_DIR"
    
    # Use docker compose (new syntax) or docker-compose (old syntax)
    if docker compose version &> /dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    else
        COMPOSE_CMD="docker-compose"
    fi

    # Start only postgres and redis from the base compose file
    $COMPOSE_CMD \
        -f docker/docker-compose.yml \
        --env-file .env.staging \
        -f docker/docker-compose.staging.yml \
        up -d postgres redis

    # Wait for PostgreSQL
    wait_for_service "localhost" "$POSTGRES_PORT" "PostgreSQL"
    
    # Wait for Redis
    wait_for_service "localhost" "$REDIS_PORT" "Redis"

    # =============================================================================
    # Step 3: Setup Python Backend
    # =============================================================================
    echo ""
    echo "============================================================"
    echo "  Step 3: Setting Up Python Backend"
    echo "============================================================"

    # Check if venv exists
    if [ ! -d "venv" ]; then
        log_info "Creating Python virtual environment..."
        python3 -m venv venv
    fi

    # Activate venv
    log_info "Activating Python virtual environment..."
    source venv/bin/activate

    # Install dependencies
    log_info "Installing Python dependencies..."
    pip install --quiet --upgrade pip
    pip install --quiet -r backend/requirements.txt

    log_success "Python backend dependencies installed"

    # =============================================================================
    # Step 4: Setup Node.js Frontend
    # =============================================================================
    echo ""
    echo "============================================================"
    echo "  Step 4: Setting Up Node.js Frontend"
    echo "============================================================"

    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        log_info "Installing Node.js dependencies..."
        npm install
    else
        log_info "Node.js dependencies already installed"
    fi

    log_success "Frontend dependencies ready"

    # =============================================================================
    # Step 5: Start Backend
    # =============================================================================
    echo ""
    echo "============================================================"
    echo "  Step 5: Starting FastAPI Backend"
    echo "============================================================"

    # Check if backend is already running
    if check_port $BACKEND_PORT "Backend"; then
        log_warning "Backend is already running. Stopping it first..."
        pkill -f "uvicorn app.main:app" || true
        sleep 2
    fi

    log_info "Starting backend on port $BACKEND_PORT..."
    cd "$SCRIPT_DIR"
    
    # Set environment variables and start backend
    export PYTHONPATH="$SCRIPT_DIR/backend"
    nohup uvicorn app.main:app \
        --host 0.0.0.0 \
        --port $BACKEND_PORT \
        --reload \
        > "$PID_DIR/backend.log" 2>&1 &
    
    echo $! > "$BACKEND_PID"
    
    # Wait for backend
    wait_for_service "localhost" "$BACKEND_PORT" "Backend API"

    # Check backend health
    log_info "Checking backend health..."
    HEALTH_RESPONSE=$(curl -s "http://localhost:$BACKEND_PORT/")
    if echo "$HEALTH_RESPONSE" | grep -q "DevSecOps"; then
        log_success "Backend is healthy!"
    else
        log_warning "Backend response: $HEALTH_RESPONSE"
    fi

    # =============================================================================
    # Step 6: Start Celery Worker
    # =============================================================================
    echo ""
    echo "============================================================"
    echo "  Step 6: Starting Celery Worker"
    echo "============================================================"

    log_info "Starting Celery worker..."
    cd "$SCRIPT_DIR"
    
    nohup celery -A app.core.celery_app.celery_app worker \
        --loglevel=info \
        --pool=solo \
        > "$PID_DIR/celery.log" 2>&1 &
    
    echo $! > "$CELERY_PID"
    
    sleep 3
    log_success "Celery worker started (PID: $(cat $CELERY_PID))"

    # =============================================================================
    # Step 7: Start Frontend
    # =============================================================================
    echo ""
    echo "============================================================"
    echo "  Step 7: Starting React Frontend (Vite)"
    echo "============================================================"

    # Check if frontend is already running
    if check_port $FRONTEND_PORT "Frontend"; then
        log_warning "Frontend is already running. Stopping it first..."
        pkill -f "vite" || true
        sleep 2
    fi

    log_info "Starting frontend dev server on port $FRONTEND_PORT..."
    cd "$SCRIPT_DIR"
    
    nohup npm run dev \
        -- --host 0.0.0.0 \
        --port $FRONTEND_PORT \
        > "$PID_DIR/frontend.log" 2>&1 &
    
    echo $! > "$FRONTEND_PID"
    
    # Wait for frontend
    wait_for_service "localhost" "$FRONTEND_PORT" "Frontend"

    # Check frontend health
    log_info "Checking frontend health..."
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$FRONTEND_PORT" | grep -q "200"; then
        log_success "Frontend is healthy!"
    else
        log_warning "Frontend may still be starting..."
    fi

    # =============================================================================
    # Step 8: Verification Summary
    # =============================================================================
    echo ""
    echo "============================================================"
    echo "  Step 8: Verification Summary"
    echo "============================================================"
    echo ""
    
    # Service status
    echo "Service Status:"
    echo "---------------"
    
    # Backend
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$BACKEND_PORT/" | grep -q "200"; then
        echo -e "  ${GREEN}✓${NC} Backend API    - http://localhost:$BACKEND_PORT"
    else
        echo -e "  ${RED}✗${NC} Backend API    - http://localhost:$BACKEND_PORT (NOT RUNNING)"
    fi
    
    # Frontend
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$FRONTEND_PORT" | grep -q "200"; then
        echo -e "  ${GREEN}✓${NC} Frontend       - http://localhost:$FRONTEND_PORT"
    else
        echo -e "  ${RED}✗${NC} Frontend       - http://localhost:$FRONTEND_PORT (NOT RUNNING)"
    fi
    
    # PostgreSQL
    if nc -z localhost $POSTGRES_PORT 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} PostgreSQL     - localhost:$POSTGRES_PORT"
    else
        echo -e "  ${RED}✗${NC} PostgreSQL     - localhost:$POSTGRES_PORT (NOT RUNNING)"
    fi
    
    # Redis
    if nc -z localhost $REDIS_PORT 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Redis          - localhost:$REDIS_PORT"
    else
        echo -e "  ${RED}✗${NC} Redis          - localhost:$REDIS_PORT (NOT RUNNING)"
    fi
    
    # Jenkins
    if curl -s -o /dev/null -w "%{http_code}" "$JENKINS_BASE_URL" | grep -q "200\|302\|403"; then
        echo -e "  ${GREEN}✓${NC} Jenkins        - $JENKINS_BASE_URL"
    else
        echo -e "  ${RED}✗${NC} Jenkins        - $JENKINS_BASE_URL (NOT ACCESSIBLE)"
    fi
    
    echo ""
    echo "Process IDs:"
    echo "------------"
    echo "  Backend:  $(cat $BACKEND_PID 2>/dev/null || echo 'N/A')"
    echo "  Celery:   $(cat $CELERY_PID 2>/dev/null || echo 'N/A')"
    echo "  Frontend: $(cat $FRONTEND_PID 2>/dev/null || echo 'N/A')"
    
    echo ""
    echo "Log Files:"
    echo "----------"
    echo "  Backend:  $PID_DIR/backend.log"
    echo "  Celery:   $PID_DIR/celery.log"
    echo "  Frontend: $PID_DIR/frontend.log"
    
    echo ""
    echo "============================================================"
    echo "  Staging Environment Ready!"
    echo "============================================================"
    echo ""
    echo "Quick Links:"
    echo "  - Frontend:  http://localhost:$FRONTEND_PORT"
    echo "  - Backend:   http://localhost:$BACKEND_PORT"
    echo "  - Jenkins:   $JENKINS_BASE_URL"
    echo "  - API Docs:  http://localhost:$BACKEND_PORT/docs"
    echo ""
    echo "To stop all services, run:"
    echo "  ./setup-staging.sh stop"
    echo ""
    echo "Or press Ctrl+C to stop (services will be cleaned up)"
    echo ""
    
    # Keep script running to maintain background processes
    # Uncomment the next line if you want to keep the script running
    # wait
}

# Stop services
stop_services() {
    echo "============================================================"
    echo "  Stopping All Services"
    echo "============================================================"
    
    # Stop Docker containers
    if docker compose version &> /dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    else
        COMPOSE_CMD="docker-compose"
    fi
    
    cd "$SCRIPT_DIR"
    $COMPOSE_CMD \
        -f docker/docker-compose.yml \
        --env-file .env.staging \
        -f docker/docker-compose.staging.yml \
        down
    
    # Kill background processes
    pkill -f "uvicorn app.main:app" || true
    pkill -f "celery -A app.core.celery_app" || true
    pkill -f "vite" || true
    
    # Clean up PID files
    rm -rf "$PID_DIR"
    
    log_success "All services stopped!"
}

# =============================================================================
# Entry Point
# =============================================================================
case "${1:-start}" in
    start)
        main
        ;;
    stop)
        stop_services
        ;;
    restart)
        stop_services
        sleep 2
        main
        ;;
    *)
        echo "Usage: $0 {start|stop|restart}"
        exit 1
        ;;
esac
