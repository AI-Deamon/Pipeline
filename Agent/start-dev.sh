#!/bin/bash

# DevSecOps Pipeline Development Startup Script
# Starts both frontend and backend services simultaneously

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if port is in use
port_in_use() {
    lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1
}

# Function to wait for service to be ready
wait_for_service() {
    local url=$1
    local service_name=$2
    local max_attempts=60
    local attempt=1
    
    print_status "Waiting for $service_name to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" >/dev/null 2>&1; then
            print_success "$service_name is ready!"
            return 0
        fi
        
        if [ $((attempt % 10)) -eq 0 ]; then
            print_status "Still waiting for $service_name... (attempt $attempt/$max_attempts)"
        fi
        
        sleep 1
        attempt=$((attempt + 1))
    done
    
    print_error "$service_name failed to start within timeout"
    return 1
}

# Function to start frontend
start_frontend() {
    print_status "Starting frontend development server..."
    
    if [ ! -d "node_modules" ]; then
        print_status "Installing frontend dependencies..."
        if command_exists pnpm; then
            pnpm install
        elif command_exists npm; then
            npm install
        else
            print_error "Neither pnpm nor npm found. Please install Node.js and pnpm."
            exit 1
        fi
    fi
    
    # Start frontend in background
    if command_exists pnpm; then
        pnpm dev &
    else
        npm run dev &
    fi
    
    FRONTEND_PID=$!
    print_success "Frontend started with PID: $FRONTEND_PID"
}

# Function to start backend
start_backend() {
    print_status "Starting backend services with Docker..."
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    
    # Start backend services
    python run.py dev &
    BACKEND_PID=$!
    print_success "Backend services started with PID: $BACKEND_PID"
}

# Function to cleanup on exit
cleanup() {
    print_status "Cleaning up processes..."
    
    # Kill frontend if running
    if [ ! -z "$FRONTEND_PID" ] && kill -0 $FRONTEND_PID 2>/dev/null; then
        print_status "Stopping frontend (PID: $FRONTEND_PID)..."
        kill $FRONTEND_PID
    fi
    
    # Stop backend services
    print_status "Stopping backend services..."
    python run.py down >/dev/null 2>&1 || true
    
    print_success "Cleanup completed"
}

# Set trap to cleanup on script exit
trap cleanup EXIT

# Main execution
main() {
    print_status "🚀 Starting DevSecOps Pipeline Development Environment"
    print_status "=================================================="
    
    # Check prerequisites
    if ! command_exists docker; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! command_exists python && ! command_exists python3; then
        print_error "Python is not installed. Please install Python first."
        exit 1
    fi
    
    # Change to Agent directory if not already there
    if [[ ! "$PWD" =~ Agent$ ]]; then
        if [ -d "Agent" ]; then
            cd Agent
            print_status "Changed to Agent directory"
        else
            print_error "Agent directory not found. Please run this script from the project root."
            exit 1
        fi
    fi
    
    # Start services
    start_backend
    sleep 5  # Give backend some time to start
    
    start_frontend
    
    # Wait for services to be ready
    print_status "Waiting for services to be ready..."
    
    # Wait for backend API
    if wait_for_service "http://localhost:8000" "Backend API"; then
        print_success "Backend API is accessible at http://localhost:8000"
    else
        print_warning "Backend API may not be fully ready yet"
    fi

    # Wait for frontend
    if wait_for_service "http://localhost:8173" "Frontend"; then
        print_success "Frontend is accessible at http://localhost:8173"
    else
        print_warning "Frontend may not be fully ready yet"
    fi

    # Wait for Jenkins
    if wait_for_service "http://localhost:8080" "Jenkins"; then
        print_success "Jenkins is accessible at http://localhost:8080"
    else
        print_warning "Jenkins may not be fully ready yet"
    fi

    print_status "=================================================="
    print_success "🎉 Development environment is ready!"
    print_status ""
    print_status "Available services:"
    print_status "  • Frontend:     http://localhost:8173"
    print_status "  • Backend API:  http://localhost:8000"
    print_status "  • Jenkins:      http://localhost:8080"
    print_status "  • PostgreSQL:   localhost:5433 (external)"
    print_status ""
    print_status "To stop all services, press Ctrl+C"
    print_status "=================================================="
    
    # Keep script running
    while true; do
        sleep 1
        
        # Check if frontend is still running
        if [ ! -z "$FRONTEND_PID" ] && ! kill -0 $FRONTEND_PID 2>/dev/null; then
            print_warning "Frontend process died. You may need to restart it manually."
        fi
    done
}

# Run main function
main "$@"