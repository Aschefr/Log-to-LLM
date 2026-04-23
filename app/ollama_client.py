import httpx
from app.database import get_setting


async def analyze(log_path: str, ctx: str, line: str, timeout: float = 60.0) -> str:
    host = get_setting("ollama_host", "http://192.168.1.100:11434")
    model = get_setting("ollama_model", "llama3.2")
    sysp = get_setting(
        "system_prompt",
        "Tu es un expert en analyse de logs.",
    )
    prompt = (
        f"Fichier: {log_path}\n\n"
        f"--- Contexte ---\n{ctx}\n\n"
        f"--- Ligne déclencheuse ---\n{line}\n\n"
        f"--- Fin ---\n\n"
        f"Analyse ces logs et fournis un diagnostic structuré."
    )
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{host.rstrip('/')}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "system": sysp,
                    "stream": False,
                },
            )
            resp.raise_for_status()
            return resp.json().get("response", "(Réponse vide)")
    except httpx.ConnectError:
        return f"ERREUR: Impossible de joindre Ollama à {host}."
    except httpx.TimeoutException:
        return f"ERREUR: Timeout vers Ollama ({host})."
    except httpx.HTTPStatusError as exc:
        return f"ERREUR HTTP {exc.response.status_code}: {exc.response.text[:500]}"
    except Exception as exc:
        return f"ERREUR: {type(exc).__name__}: {exc}"
