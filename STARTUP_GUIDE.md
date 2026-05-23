# DevSecOps Pipeline - Development Startup Guide

This guide provides quick commands to start your development environment with both frontend and backend services running simultaneously.

## Quick Start

### Option 1: Use the Startup Scripts (Recommended)

#### Linux/macOS
```bash
cd Agent
./start-dev.sh
```

#### Windows
```bash
cd Agent
start-dev.bat
```

### Option 2: Manual Startup

#### Start Backend Services
```bash
cd Agent
python run.py dev
```

#### Start Frontend (in a new terminal)
```bash
cd Agent
pnpm install  # First time only
pnpm dev
```

## What Gets Started

When you run the startup scripts, the following services will be available:

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:5173 | React development server with hot reload |
| **Backend API** | http://localhost:8000 | FastAPI backend with PostgreSQL |
| **Jenkins** | http://localhost:8080 | CI/CD pipeline management |
| **PostgreSQL** | localhost:5432 | Database (internal) |
| **Redis** | localhost:6379 | Task queue (internal) |

## Prerequisites

- **Docker** - Required for backend services (PostgreSQL, Redis, Jenkins)
- **Node.js** - Required for frontend development
- **pnpm** (recommended) or **npm** - Package manager
- **Python 3.8+** - Required for backend and Docker orchestration

## Installation Commands

### Docker
- **Windows**: [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop)
- **macOS**: [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop)
- **Linux**: `sudo apt-get install docker.io docker-compose` (Ubuntu/Debian)

### Node.js and pnpm
```bash
# Install Node.js (includes npm)
# Download from: https://nodejs.org/

# Install pnpm (recommended)
npm install -g pnpm

# Or use npm (alternative)
npm install -g npm
```

### Python
```bash
# Windows: Download from https://python.org
# macOS: brew install python
# Linux: sudo apt-get install python3 python3-pip
```

## Stopping Services

### Using Scripts (Automatic Cleanup)
Press `Ctrl+C` in the terminal where you ran the startup script.

### Manual Cleanup
```bash
# Stop frontend (Ctrl+C in frontend terminal)

# Stop backend services
cd Agent
python run.py down
```

## Troubleshooting

### Port Already in Use
If you get "port already in use" errors:
```bash
# Check what's using the port
lsof -i :5173  # Frontend
lsof -i :8000  # Backend
lsof -i :8080  # Jenkins

# Kill the process
kill -9 <PID>
```

### Docker Issues
```bash
# Restart Docker
sudo systemctl restart docker  # Linux
# Or restart Docker Desktop (Windows/macOS)

# Clean up old containers
docker system prune -f
```

### Frontend Dependencies Issues
```bash
cd Agent
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Backend Database Issues
```bash
cd Agent
python run.py down
python run.py dev
```

## Development Workflow

1. **Start Environment**: Run `./start-dev.sh` (Linux/macOS) or `start-dev.bat` (Windows)
2. **Code**: Make changes to frontend (`src/`) or backend (`backend/app/`)
3. **Test**: Frontend auto-reloads, backend restarts automatically in Docker
4. **Stop**: Press `Ctrl+C` when done

## Project Structure

```
Agent/
├── src/              # React frontend (TypeScript)
├── backend/app/      # FastAPI backend (Python)
├── docker/           # Docker configurations
├── start-dev.sh      # Linux/macOS startup script
├── start-dev.bat     # Windows startup script
└── run.py           # Docker orchestration
```

## Environment Files

- `.env.dev` - Development environment configuration
- `.env.test` - Test environment configuration
- `.env.staging` - Staging environment configuration

## Need Help?

- Check the main [README.md](./README.md) for detailed project information
- Review [AGENTS.md](./AGENTS.md) for development guidelines
- Check [docs/](./docs/) for technical documentation