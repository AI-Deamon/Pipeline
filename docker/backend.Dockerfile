FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app/backend

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt && \
    find /usr/local/lib -name '*.pyc' -delete && \
    find /usr/local/lib -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true

COPY backend /app/backend

ENV PYTHONPATH=/app/backend

RUN adduser --disabled-password --gecos "" appuser && chown -R appuser /app
USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
