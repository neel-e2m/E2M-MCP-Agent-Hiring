FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run via SSE transport on Railway/Render
ENV MCP_TRANSPORT=sse
CMD ["python", "server.py"]
