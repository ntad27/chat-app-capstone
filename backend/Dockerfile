FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml .

# Install dependencies only (not the package itself)
RUN pip install --no-cache-dir \
    "fastapi>=0.115.0" \
    "uvicorn[standard]>=0.30.0" \
    "anthropic>=0.42.0" \
    "pydantic-settings>=2.0.0" \
    "sse-starlette>=2.0.0" \
    "python-dotenv>=1.0.0"

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
