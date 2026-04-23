import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
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
async def api_save_settings(data: dict):
    for key, value in data.items():
        set_setting(key, value)
    return {"status": "ok"}


@app.get("/api/rules")
async def api_rules():
    return all_rules()


@app.post("/api/rules")
async def api_add_rule(
    name: str,
    log_path: str,
    keywords: list[str],
    context_lines: int = 10,
    debounce: int = 30,
):
    if not name or not log_path or not keywords:
        raise HTTPException(400, "Champs requis manquants")
    return {
        "status": "ok",
        "id": add_rule(name, log_path, keywords, context_lines, debounce),
    }


@app.put("/api/rules/{rid}")
async def api_upd_rule(
    rid: int,
    name: str,
    log_path: str,
    keywords: list[str],
    context_lines: int = 10,
    enabled: bool = True,
    debounce: int = 30,
):
    upd_rule(rid, name, log_path, keywords, context_lines, enabled, debounce)
    return {"status": "ok"}


@app.delete("/api/rules/{rid}")
async def api_del_rule(rid: int):
    del_rule(rid)
    return {"status": "ok"}


@app.post("/api/rules/{rid}/force-analyze")
async def api_force(rid: int):
    result = await WATCHER.force(rid)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return result


@app.get("/api/alerts")
async def api_alerts(limit: int = 100, offset: int = 0):
    return get_alerts(limit, offset)


@app.delete("/api/alerts/{aid}")
async def api_del_alert(aid: int):
    del_alert(aid)
    return {"status": "ok"}


@app.delete("/api/alerts")
async def api_clear_alerts():
    clear_alerts()
    return {"status": "ok"}


@app.get("/api/status")
async def api_status():
    import datetime
    rules = all_rules()
    return {
        "rules": len(rules),
        "active": sum(1 for r in rules if r["enabled"]),
        "ts": datetime.datetime.now().isoformat(),
    }
