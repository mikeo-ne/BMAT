FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY eastsound_ingest ./eastsound_ingest
COPY stations.csv .

# Fingerprint index + dry-run output live on a volume so they survive restarts.
VOLUME ["/app/data"]
ENV PYTHONUNBUFFERED=1 EST_INDEX_PATH=/app/data/fingerprints.db EST_OUT_DIR=/app/data/out

RUN useradd --system --uid 10001 ingest && mkdir -p /app/data && chown ingest /app/data
USER ingest

CMD ["python", "-m", "eastsound_ingest", "--stations", "stations.csv", "run"]
