import aiosmtplib
import httpx
import email.utils
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.database import get_setting


async def notify(line: str, ai_resp: str, log_path: str, ts: float) -> bool:
    subj = f"[Sentinel] Alerte - {log_path}"
    body = (
        "═" * 36 + "\n"
        "  SENTINEL - ALERTE LOG\n"
        "═" * 36 + "\n\n"
        f"Horodatage: {email.utils.formatdate(ts, localtime=True)}\n"
        f"Fichier: {log_path}\n\n"
        "--- Ligne déclencheuse ---\n"
        f"{line}\n\n"
        "--- Analyse IA ---\n"
        f"{ai_resp}\n\n"
        "═" * 36 + "\n"
    )
    sent = False
    if get_setting("smtp_enabled", "false").lower() == "true":
        sent = sent or await _smtp(subj, body)
    if get_setting("apprise_enabled", "false").lower() == "true":
        sent = sent or await _apprise(subj, body)
    return sent


async def _smtp(subj: str, body: str) -> bool:
    try:
        server = get_setting("smtp_server", "")
        port = int(get_setting("smtp_port", "587"))
        user = get_setting("smtp_user", "")
        password = get_setting("smtp_password", "")
        tls = get_setting("smtp_tls", "true").lower() == "true"
        fr = get_setting("smtp_from", "")
        to = get_setting("smtp_to", "")
        if not all([server, user, password, fr, to]):
            return False
        msg = MIMEMultipart()
        msg["From"] = fr
        msg["To"] = to
        msg["Subject"] = subj
        msg.attach(MIMEText(body, "plain", "utf-8"))
        await aiosmtplib.send(
            msg,
            hostname=server,
            port=port,
            username=user,
            password=password,
            start_tls=tls,
        )
        return True
    except Exception as exc:
        print(f"[SMTP] {exc}")
        return False


async def _apprise(subj: str, body: str) -> bool:
    try:
        url = get_setting("apprise_url", "")
        if not url:
            return False
        method = get_setting("apprise_method", "POST").upper()
        async with httpx.AsyncClient(timeout=15.0) as client:
            if method == "POST":
                resp = await client.post(url, json={"title": subj, "body": body})
            else:
                resp = await client.get(url, params={"title": subj, "body": body})
        return resp.status_code in (200, 201, 204)
    except Exception as exc:
        print(f"[APPRISE] {exc}")
        return False
