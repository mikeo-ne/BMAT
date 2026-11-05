FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY eastsound_ingest ./eastsound_ingest
COPY stations.csv .
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Fingerprint index + dry-run output live on a volume mounted at /app/data so
# they survive restarts (Railway: Volumes → mount path /app/data; Fly: fly.toml
# [mounts]; docker run: -v ingest-data:/app/data). No VOLUME instruction here:
# Railway rejects Dockerfiles that declare one.
ENV PYTHONUNBUFFERED=1 EST_INDEX_PATH=/app/data/fingerprints.db EST_OUT_DIR=/app/data/out

RUN useradd --system --uid 10001 ingest && mkdir -p /app/data && chown -R ingest /app/data

# Starts as root only long enough to take ownership of a root-owned volume
# (Railway/Fly mount them that way), then drops to `ingest` before running.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["python", "-m", "eastsound_ingest", "--stations", "stations.csv", "run"]
