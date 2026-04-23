import os
import time
import asyncio
import json
from app.database import all_rules, get_setting, set_last_alert, add_alert
from app.ollama_client import ask_ollama
from app.notifier import notify

# ── Mots-clés par défaut ──
DEFAULT_KEYWORDS = [
    "ERROR", "CRITICAL", "FATAL", "panic", "segfault",
    "exception", "timeout", "refused", "denied", "failed",
    "out of memory", "disk full", "connection reset",
]


class Watcher:
    def __init__(self):
        self._task = None
        self._rules = []
        self._positions = {}
        self._inodes = {}

    async def start(self):
        await self.reload_rules()
        self._task = asyncio.create_task(self._loop())

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def reload_rules(self):
        self._rules = all_rules()

    async def reload_settings(self):
        pass

    async def force_analyze(self, rid):
        for r in self._rules:
            if r["id"] == rid:
                await self._scan_rule(r)
                return
        raise ValueError(f"Règle {rid} introuvable")

    async def _loop(self):
        while True:
            try:
                for r in self._rules:
                    if r["enabled"]:
                        await self._scan_rule(r)
                await asyncio.sleep(1)
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(1)

    async def _scan_rule(self, rule):
        path = rule["log_path"]
        rid = rule["id"]
        mode = rule.get("mode", "keyword")
        keywords = rule.get("keywords", [])
        ctx_n = rule.get("context_lines", 10)
        debounce = rule.get("debounce", 30)

        if not os.path.isfile(path):
            return

        try:
            st = os.stat(path)
        except (FileNotFoundError, PermissionError):
            return

        cur_inode = st.st_ino
        cur_size = st.st_size

        # Rotation détectée
        if self._inodes.get(rid) != cur_inode or cur_size < self._positions.get(rid, 0):
            self._positions[rid] = 0
            self._inodes[rid] = cur_inode

        offset = self._positions.get(rid, 0)

        try:
            with open(path, "r", errors="replace") as f:
                f.seek(offset)
                new_lines = f.readlines()
                self._positions[rid] = f.tell()
        except (PermissionError, OSError):
            return

        if not new_lines:
            return

        # Mode "every" : déclencher sur chaque nouvelle ligne
        if mode == "every":
            for line in new_lines:
                line = line.rstrip("\n")
                if not line.strip():
                    continue
                now = time.time()
                if now - rule.get("last_alert", 0) < debounce:
                    continue
                ctx = self._get_context(path, offset, ctx_n)
                await self._process_alert(rid, path, line, ctx)
            return

        # Mode "keyword" : filtrer par mots-clés
        kw_lower = [k.lower() for k in keywords]
        for line in new_lines:
            line = line.rstrip("\n")
            if not line.strip():
                continue
            if any(k in line.lower() for k in kw_lower):
                now = time.time()
                if now - rule.get("last_alert", 0) < debounce:
                    continue
                ctx = self._get_context(path, offset, ctx_n)
                await self._process_alert(rid, path, line, ctx)

    def _get_context(self, path, current_offset, n):
        try:
            with open(path, "r", errors="replace") as f:
                f.seek(0, 2)
                total = f.tell()
                start = max(0, current_offset - 2048)
                f.seek(start)
                chunk = f.read()
                lines = chunk.splitlines()
                return "\n".join(lines[-n:])
        except Exception:
            return ""

    async def _process_alert(self, rid, path, line, ctx):
        host = get_setting("ollama_host")
        model = get_setting("ollama_model")
        prompt = get_setting("system_prompt")

        ai_resp = ""
        if host and model:
            ai_resp = await ask_ollama(host, model, prompt, line, ctx)

        notified = False
        if get_setting("smtp_enabled") == "true" or get_setting("apprise_enabled") == "true":
            notified = await notify(line, ai_resp)

        add_alert(rid, path, line, ctx, ai_resp, notified)
        set_last_alert(rid, time.time())
