import sqlite3
import os
import json
import time

DB = os.environ.get("DB_PATH", "/app/data/sentinel.db")


def _db():
    d = os.path.dirname(DB) or "."
    os.makedirs(d, exist_ok=True)
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    return c


def init_db():
    c = _db()
    c.execute(
        "CREATE TABLE IF NOT EXISTS settings "
        "(key TEXT PRIMARY KEY, value TEXT NOT NULL)"
    )
    c.execute(
        "CREATE TABLE IF NOT EXISTS rules ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "name TEXT NOT NULL, "
        "log_path TEXT NOT NULL UNIQUE, "
        "keywords TEXT NOT NULL DEFAULT '[]', "
        "mode TEXT NOT NULL DEFAULT 'keyword', "
        "context_lines INTEGER NOT NULL DEFAULT 10, "
        "enabled INTEGER NOT NULL DEFAULT 1, "
        "debounce INTEGER NOT NULL DEFAULT 30, "
        "last_alert REAL NOT NULL DEFAULT 0)"
    )
    c.execute(
        "CREATE TABLE IF NOT EXISTS alerts ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "ts REAL NOT NULL, "
        "rule_id INTEGER, "
        "log_path TEXT NOT NULL, "
        "line TEXT NOT NULL, "
        "ctx TEXT, "
        "ai_resp TEXT, "
        "notified INTEGER NOT NULL DEFAULT 0)"
    )
    defaults = {
        "ollama_host": "http://192.168.1.100:11434",
        "ollama_model": "llama3.2",
        "system_prompt": (
            "Tu es un expert en analyse de logs. "
            "Donne un diagnostic concis : cause, gravité, recommandation. "
            "Réponds en français."
        ),
        "smtp_enabled": "false",
        "smtp_server": "smtp.example.com",
        "smtp_port": "587",
        "smtp_user": "",
        "smtp_password": "",
        "smtp_tls": "true",
        "smtp_from": "",
        "smtp_to": "",
        "apprise_enabled": "false",
        "apprise_url": "",
        "apprise_method": "POST",
    }
    for k, v in defaults.items():
        c.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v)
        )
    c.commit()
    c.close()


def get_setting(key, default=""):
    r = _db().execute(
        "SELECT value FROM settings WHERE key = ?", (key,)
    ).fetchone()
    _db().close()
    return r["value"] if r else default


def set_setting(key, value):
    c = _db()
    c.execute(
        "INSERT OR REPLACE INTO settings VALUES (?, ?)", (key, str(value))
    )
    c.commit()
    c.close()


def all_settings():
    rows = _db().execute(
        "SELECT key, value FROM settings ORDER BY key"
    ).fetchall()
    _db().close()
    return {row["key"]: row["value"] for row in rows}


def all_rules():
    rows = _db().execute("SELECT * FROM rules ORDER BY id").fetchall()
    _db().close()
    return [
        dict({**row, "keywords": json.loads(row["keywords"])})
        for row in rows
    ]


def add_rule(name, log_path, keywords, mode, context_lines, debounce=30):
    c = _db()
    c.execute(
        "INSERT INTO rules "
        "(name, log_path, keywords, mode, context_lines, enabled, debounce) "
        "VALUES (?, ?, ?, ?, ?, 1, ?)",
        (name, log_path, json.dumps(keywords), mode, context_lines, debounce),
    )
    c.commit()
    rid = c.lastrowid
    c.close()
    return rid


def upd_rule(rid, name, log_path, keywords, mode, context_lines, enabled, debounce=30):
    c = _db()
    c.execute(
        "UPDATE rules SET name = ?, log_path = ?, keywords = ?, "
        "mode = ?, context_lines = ?, enabled = ?, debounce = ? WHERE id = ?",
        (
            name, log_path, json.dumps(keywords),
            mode, context_lines, 1 if enabled else 0, debounce, rid,
        ),
    )
    c.commit()
    c.close()


def del_rule(rid):
    c = _db()
    c.execute("DELETE FROM rules WHERE id = ?", (rid,))
    c.commit()
    c.close()


def set_last_alert(rid, ts):
    c = _db()
    c.execute("UPDATE rules SET last_alert = ? WHERE id = ?", (ts, rid))
    c.commit()
    c.close()


def add_alert(rid, log_path, line, ctx, ai_resp, notified=False):
    c = _db()
    c.execute(
        "INSERT INTO alerts "
        "(ts, rule_id, log_path, line, ctx, ai_resp, notified) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (time.time(), rid, log_path, line, ctx, ai_resp, 1 if notified else 0),
    )
    c.commit()
    c.close()


def get_alerts(limit=100, offset=0):
    rows = _db().execute(
        "SELECT * FROM alerts ORDER BY ts DESC LIMIT ? OFFSET ?",
        (limit, offset),
    ).fetchall()
    _db().close()
    return [dict(row) for row in rows]


def del_alert(aid):
    c = _db()
    c.execute("DELETE FROM alerts WHERE id = ?", (aid,))
    c.commit()
    c.close()


def clear_alerts():
    c = _db()
    c.execute("DELETE FROM alerts")
    c.commit()
    c.close()
