# Finding #84: pinned by digest, not just the floating `3.11-slim` tag — two
# builds a month apart could otherwise pull materially different image content
# under the identical tag with no signal anything changed. Re-resolve and bump
# this digest periodically to pick up base-image security patches.
FROM python:3.11-slim@sha256:9c900dea9e8fb7e16277c179b555cc72d29a352dbc33cff48ad5a0412fd5bfc7

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
