from threading import RLock

# Shared in-memory stores across routers/services
projects_db: dict[str, dict] = {}
scans_db: dict[str, object] = {}
scans_db_lock = RLock()
