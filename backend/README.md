# DevSecOps Backend Control Plane

## Setup

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install fastapi uvicorn pydantic
   ```

3. Run the API:
   ```bash
   uvicorn app.main:app --reload
   ```

## API Endpoints

- `POST /api/projects`: Create a project
- `POST /api/scans`: Trigger a scan
- `GET /api/scans/{scan_id}`: Get scan status
