import asyncio
import os
import time
from app.database import all_rules, set_last_alert, add_alert
from app.ollama_client import analyze
from app.notifier import notify


class Watcher:
    def __init__(self):
        self._pos: dict[str, int] = {}
        self._ino: dict[str, int] = {}
        self._run = False
        self._task: asyncio.Task | None = None

    async def start(self):
        self._run = True
        self._task = asyncio.create_task(self._loop())

    async def stop(self):
        self._run = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _loop(self):
        while self._run:
            try:
                for rule in all_rules():
                    if rule["enabled"]:
                        await self._check(rule)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                print(f"[WATCHER] {exc}")
            await asyncio.sleep(1)

    async def _check(self, rule: dict):
        path = rule["log_path"]
        try:
            if not os.path.exists(path):
                self._pos.pop(path, None)
                self._ino.pop(path, None)
                return

            stat = os.stat(path)
            ino = stat.st_ino
            size = stat.st_size

            if self._ino.get(path) is not None and (
                ino != self._ino[path] or size < self._pos.get(path, 0)
            ):
                self._pos[path] = 0

            self._ino[path] = ino
            pos = self._pos.get(path, 0)

            if size <= pos:
                return

            with open(path, "r", errors="replace") as fh:
                fh.seek(pos)
                new_data = fh.read()
                self._pos[path] = fh.tell()

            lines = new_data.splitlines()
            buf: list[str] = []

            for line in lines:
                for kw in rule["keywords"]:
                    if kw.lower() in line.lower():
                        now = time.time()
                        if (now - rule["last_alert"]) < rule["debounce"]:
                            return
                        ctx = "\n".join(buf[-rule["context_lines"]:]) if buf else "(pas de contexte)"
                        set_last_alert(rule["id"], now)
                        resp = await analyze(path, ctx, line)
                        notified = await notify(line, resp, path, now)
                        add_alert(rule["id"], path, line, ctx, resp, notified)
                        break
                buf.append(line)
                if len(buf) > 200:
                    buf = buf[-200:]
        except PermissionError:
            print(f"[WATCHER] Permission refusée: {path}")
        except Exception as exc:
            print(f"[WATCHER] {path}: {exc}")

    async def force(self, rid: int) -> dict:
        rules = all_rules()
        rule = next((r for r in rules if r["id"] == rid), None)
        if not rule:
            return {"error": "Règle introuvable"}
        path = rule["log_path"]
        try:
            if not os.path.exists(path):
                return {"error": f"Fichier introuvable: {path}"}
            with open(path, "r", errors="replace") as fh:
                all_lines = fh.readlines()
            if not all_lines:
                return {"error": "Fichier vide"}
            tail = all_lines[-(rule["context_lines"] + 10):]
            ctx = "".join(tail[:-1])
            trig = tail[-1].strip()
            resp = await analyze(path, ctx, trig)
            add_alert(rule["id"], path, trig, ctx, resp, False)
            return {"ok": True, "line": trig, "ai_resp": resp}
        except Exception as exc:
            return {"error": str(exc)}
