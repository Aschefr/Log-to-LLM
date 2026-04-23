import os
from contextlib import asynccontextmanager
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.database import (
    init_db,
    all_settings,
    set_setting,
    all_rules,
    add_rule,
    upd_rule,
    del_rule,
    get_alerts,
    del_alert,
    clear_alerts,
)
from app.watcher import Watcher

WATCHER = Watcher()
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")


class RuleCreate(BaseModel):
    name: str
    log_path: str
    keywords: list[str]
    mode: str = "keyword"
    context_lines: int = 10
    debounce: int = 30


class RuleUpdate(BaseModel):
    name: str
    log_path: str
    keywords: list[str]
    mode: str = "keyword"
    context_lines: int = 10
    enabled: bool = True
    debounce: int = 30


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    await WATCHER.start()
    print("[SENTINEL] Démarré sur le port 10911")
    yield
    await WATCHER.stop()
    print("[SENTINEL] Arrêté")


app = FastAPI(title="Log-to-LLM Sentinel", lifespan=lifespan)

if os.path.isdir(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def index():
    p = os.path.join(STATIC_DIR, "index.html")
    return FileResponse(p) if os.path.exists(p) else "Not found"


@app.get("/api/settings")
async def api_settings():
    return all_settings()


@app.post("/api/settings")
async def api_settings_save(data: dict):
    for k, v in data.items():
        set_setting(k, v)
    await WATCHER.reload_settings()
    return {"ok": True}


@app.get("/api/rules")
async def api_rules():
    return all_rules()


@app.post("/api/rules")
async def api_rules_add(body: RuleCreate):
    if body.mode not in ("keyword", "every"):
        raise HTTPException(400, "mode must be 'keyword' or 'every'")
    rid = add_rule(body.name, body.log_path, body.keywords, body.mode, body.context_lines, body.debounce)
    await WATCHER.reload_rules()
    return {"id": rid}


@app.put("/api/rules/{rid}")
async def api_rules_upd(rid: int, body: RuleUpdate):
    if body.mode not in ("keyword", "every"):
        raise HTTPException(400, "mode must be 'keyword' or 'every'")
    upd_rule(rid, body.name, body.log_path, body.keywords, body.mode, body.context_lines, body.enabled, body.debounce)
    await WATCHER.reload_rules()
    return {"ok": True}


@app.delete("/api/rules/{rid}")
async def api_rules_del(rid: int):
    del_rule(rid)
    await WATCHER.reload_rules()
    return {"ok": True}


@app.post("/api/rules/{rid}/force-analyze")
async def api_rules_force(rid: int):
    await WATCHER.force_analyze(rid)
    return {"ok": True}


@app.get("/api/alerts")
async def api_alerts(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    return get_alerts(limit, offset)


@app.delete("/api/alerts/{aid}")
async def api_alerts_del(aid: int):
    del_alert(aid)
    return {"ok": True}


@app.delete("/api/alerts")
async def api_alerts_clear():
    clear_alerts()
    return {"ok": True}


@app.get("/api/status")
async def api_status():
    rules = all_rules()
    return {
        "rules": len(rules),
        "active": sum(1 for r in rules if r["enabled"]),
        "ts": __import__("time").time(),
    }


@app.get("/api/files")
async def api_files(path: str = "/"):
    """Navigate only within configured watch roots."""
    import os as _os

    # Get watch roots from settings (comma-separated)
    roots_str = all_settings().get("watch_roots", "/logs")
    roots = [r.strip() for r in roots_str.split(",") if r.strip()]
    if not roots:
        roots = ["/logs"]

    # Normalize path
    if not path.startswith("/"):
        path = "/" + path
    path = path.rstrip("/") or "/"

    # Check if path is within allowed roots
    allowed = False
    for root in roots:
        if path == root or path.startswith(root + "/"):
            allowed = True
            break

    if not allowed and path != "/":
        raise HTTPException(403, "Hors des répertoires autorisés")

    # If at root, show only the watch roots
    if path == "/":
        entries = []
        for root in roots:
            if _os.path.isdir(root):
                entries.append({
                    "name": root.lstrip("/"),
                    "path": root,
                    "is_dir": True,
                    "readable": True,
                    "size": 0,
                })
        return {"path": "/", "parent": None, "entries": entries}

    # List directory contents
    try:
        if not _os.path.isdir(path):
            raise HTTPException(404, "Dossier introuvable")

        entries = []
        for name in sorted(_os.listdir(path)):
            full = _os.path.join(path, name)
            is_dir = _os.path.isdir(full)
            readable = _os.access(full, _os.R_OK) if not is_dir else True
            size = _os.path.getsize(full) if not is_dir else 0
            entries.append({
                "name": name,
                "path": full,
                "is_dir": is_dir,
                "readable": readable,
                "size": size,
            })

        parent = _os.path.dirname(path) if path != "/" else None
        return {"path": path, "parent": parent, "entries": entries}
    except PermissionError:
        raise HTTPException(403, "Accès refusé")
    except Exception as e:
        raise HTTPException(500, str(e))
