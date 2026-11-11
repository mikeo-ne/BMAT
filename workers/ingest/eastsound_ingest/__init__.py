"""East Sound stream-ingest worker: monitors station streams and logs airplay detections."""
__version__ = "0.1.0"


def build_id() -> str:
    """Which build is running — the question "did my deploy land?" without logs.

    Railway injects the commit SHA into the container. A heartbeat that carries
    it turns that question into one database read.
    """
    import os

    for key in ("RAILWAY_GIT_COMMIT_SHA", "GIT_COMMIT_SHA", "WORKER_BUILD"):
        value = os.environ.get(key, "").strip()
        if value:
            return value[:12]
    return "local"
