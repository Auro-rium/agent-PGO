FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY pyproject.toml requirements.txt ./
COPY apps ./apps
COPY cli ./cli
COPY migrations ./migrations
COPY services ./services
COPY packages ./packages
RUN pip install --no-cache-dir -e .

EXPOSE 8000
CMD ["uvicorn", "apps.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
