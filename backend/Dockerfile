FROM python:3.11-slim

WORKDIR /app

RUN addgroup --system app && adduser --system --group app

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY . .

USER app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
