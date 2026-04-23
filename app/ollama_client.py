import httpx
import asyncio


async def ask_ollama(host: str, model: str, system_prompt: str, line: str, ctx: str) -> str:
    """Interroge Ollama et retourne la réponse de l'IA."""
    url = f"{host.rstrip('/')}/api/chat"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Contexte (lignes avant) :\n{ctx}\n\nLigne suspecte :\n{line}\n\nAnalyse ce qui s'est passé et explique brièvement."},
        ],
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data.get("message", {}).get("content", "(pas de réponse)")
    except Exception as e:
        return f"Erreur Ollama : {e}"
