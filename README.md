# 🛡️ Log-to-LLM Sentinel

> **Surveillez vos fichiers log en temps réel, détectez les erreurs, obtenez un diagnostic IA et recevez des alertes — le tout configurable depuis une interface web, sans toucher à un seul fichier de configuration.**

---

## Table des matières

1. [Ce que fait l'outil](#ce-que-fait-loutil)
2. [Prérequis](#prérequis)
3. [Installation pas à pas](#installation-pas-à-pas)
4. [Première configuration via la GUI](#première-configuration-via-la-gui)
5. [Surveiller vos propres logs](#surveiller-vos-propres-logs)
6. [Comprendre l'architecture](#comprendre-larchitecture)
7. [API REST](#api-rest)
8. [Dépannage](#dépannage)
9. [Structure du projet](#structure-du-projet)

---

## Ce que fait l'outil

```
┌──────────────────┐
│  Fichiers log    │  /var/log/syslog, /home/user/app.log, etc.
└────────┬─────────┘
         │  lecture en temps réel (chaque seconde)
         ▼
┌──────────────────┐
│  Moteur de       │  Cherche les mots-clés configurés
│  détection       │  (ERROR, CRITICAL, panic, etc.)
└────────┬─────────┘
         │  si mot-clé trouvé + anti-flood OK
         ▼
┌──────────────────┐
│  Ollama (LLM)    │  Envoie le contexte + la ligne à un modèle local
│  sur votre PC    │  pour obtenir un diagnostic structuré
└────────┬─────────┘
         │  réponse IA reçue
         ▼
┌──────────────────┐
│  Notifications   │  Email SMTP et/ou webhook Apprise
│  (optionnel)     │
└──────────────────┘

Tout est stocké dans une base SQLite et modifiable depuis la GUI.
```

---

## Prérequis

| Élément | Version | Où le trouver |
|---------|---------|---------------|
| **Linux** | N'importe quelle distribution récente | — |
| **Docker** | ≥ 20.10 | [docker.com/get-started](https://docs.docker.com/get-started/) |
| **Docker Compose** | V2 (inclus dans Docker Desktop / `docker-compose-plugin`) | — |
| **Ollama** | Dernière version | [ollama.com](https://ollama.com) |
| **Navigateur web** | N'importe lequel | — |

### Vérifier Docker

```bash
docker --version
docker compose version
```

Si les commandes ne fonctionnent pas, installez Docker :

```bash
# Debian / Ubuntu
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# → Déconnectez-vous et reconnectez-vous

# Fedora / RHEL
sudo dnf install -y docker-ce docker-compose-plugin
sudo systemctl enable --now docker
```

### Vérifier Ollama

```bash
# Installer Ollama (si pas déjà fait)
curl -fsSL https://ollama.com/install.sh | sh

# Télécharger un modèle
ollama pull llama3.2

# Tester
ollama run llama3.2 "Dis bonjour"
```

> **Important** : Ollama doit être accessible depuis le conteneur Docker. Par défaut, il écoute sur `127.0.0.1:11434`. Pour le rendre accessible depuis Docker, lancez-le avec :
>
> ```bash
> OLLAMA_HOST=0.0.0.0 ollama serve
> ```
>
> Ou utilisez `host.docker.internal` (voir plus bas).

---

## Installation pas à pas

### Étape 1 — Cloner ou créer les fichiers

Créez un dossier et placez-y tous les fichiers du projet :

```bash
mkdir ~/sentinel && cd ~/sentinel
```

Vous devez avoir cette structure :

```
~/sentinel/
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── README.md
└── app/
    ├── __init__.py
    ├── main.py
    ├── database.py
    ├── ollama_client.py
    ├── notifier.py
    ├── watcher.py
    └── static/
        ├── index.html
        ├── style.css
        └── app.js
```

### Étape 2 — Adapter docker-compose.yml

Ouvrez `docker-compose.yml` et vérifiez les montages de volume :

```yaml
volumes:
  - sentinel-data:/app/data        # ← Base de données (ne pas toucher)
  - /var/log:/logs:ro              # ← Logs système (adaptez si besoin)
```

**Que signifient ces lignes ?**

| Ligne | Explication |
|-------|-------------|
| `sentinel-data:/app/data` | Volume Docker nommé. Stocke la base SQLite. Persiste entre les redémarrages. |
| `/var/log:/logs:ro` | Monte vos logs système dans le conteneur en **lecture seule** (`:ro`). Dans la GUI, vous pointerez vers `/logs/syslog`, `/logs/kern.log`, etc. |

**Pour ajouter vos propres logs d'application :**

```yaml
volumes:
  - sentinel-data:/app/data
  - /var/log:/logs:ro
  - /home/user/mon-app/logs:/app-logs:ro   # ← Ajoutez cette ligne
```

> **Règle d'or** : le chemin de **gauche** est sur votre machine, le chemin de **droite** est dans le conteneur. Dans la GUI, vous utiliserez toujours le chemin de **droite**.

### Étape 3 — Configurer l'accès à Ollama

Trois options selon votre installation :

#### Option A — Ollama sur la même machine (recommandé)

Ajoutez `extra_hosts` dans `docker-compose.yml` :

```yaml
services:
  sentinel:
    build: .
    container_name: sentinel
    restart: unless-stopped
    ports:
      - "10911:10911"
    extra_hosts:
      - "host.docker.internal:host-gateway"   # ← Ajoutez ces 2 lignes
    volumes:
      - sentinel-data:/app/data
      - /var/log:/logs:ro
```

Dans la GUI → Config IA → mettez : `http://host.docker.internal:11434`

#### Option B — IP directe

Si vous connaissez l'IP de votre machine (ex: `192.168.1.50`) :

Dans la GUI → Config IA → mettez : `http://192.168.1.50:11434`

#### Option C — Ollama dans un autre conteneur Docker

Connectez les deux conteneurs au même réseau :

```yaml
services:
  sentinel:
    networks:
      - mon-reseau

  ollama:
    image: ollama/ollama
    networks:
      - mon-reseau

networks:
  mon-reseau:
```

Dans la GUI → Config IA → mettez : `http://ollama:11434`

### Étape 4 — Construire et lancer

```bash
cd ~/sentinel
docker compose up -d --build
```

**Que fait cette commande ?**

| Partie | Action |
|--------|--------|
| `docker compose` | Utilise le fichier `docker-compose.yml` |
| `up` | Crée et démarre le conteneur |
| `-d` | Mode détaché (en arrière-plan) |
| `--build` | Reconstruit l'image depuis le Dockerfile |

### Étape 5 — Vérifier que tout fonctionne

```bash
# Voir les logs du conteneur
docker compose logs -f

# Vous devriez voir :
# sentinel  | [SENTINEL] Démarré sur le port 10911

# Vérifier l'état
docker compose ps

# Tester l'API
curl http://localhost:10911/api/status
# Réponse attendue : {"rules":0,"active":0,"ts":"2025-..."}
```

### Étape 6 — Ouvrir la GUI

Ouvrez votre navigateur et allez à :

```
http://localhost:10911
```

Vous devriez voir l'interface avec 4 onglets.

---

## Première configuration via la GUI

### 1. Configurer Ollama (onglet "Config IA")

| Champ | Valeur |
|-------|--------|
| **Adresse Ollama** | `http://host.docker.internal:11434` (ou votre IP) |
| **Modèle** | `llama3.2` (ou le modèle de votre choix) |
| **System Prompt** | Laissez la valeur par défaut ou personnalisez |

Cliquez **💾 Sauvegarder**.

### 2. Créer votre première règle (onglet "Règles")

Cliquez **+ Nouvelle Règle** :

| Champ | Exemple |
|-------|---------|
| **Nom** | `Syslog erreurs` |
| **Chemin du log** | `/logs/syslog` |
| **Mots-clés** | `ERROR, CRITICAL, panic, segfault` |
| **Lignes de contexte** | `10` |
| **Anti-flood** | `30` |

Cliquez **💾 Enregistrer**.

### 3. Tester avec "Analyser maintenant"

Sur la carte de votre règle, cliquez **🔍 Analyser maintenant**.

Cela force une analyse immédiate des dernières lignes du fichier. Si des mots-clés sont trouvés, une alerte apparaît dans l'onglet **Dashboard** avec la réponse de l'IA.

### 4. Configurer les notifications (optionnel)

#### Email SMTP

| Champ | Exemple |
|-------|---------|
| **Activer** | ☑ Cocher |
| **Serveur** | `smtp.gmail.com` |
| **Port** | `587` |
| **TLS** | ☑ Cocher |
| **Utilisateur** | `votre@email.com` |
| **Mot de passe** | Mot de passe d'application (pas votre mot de passe principal) |
| **De** | `votre@email.com` |
| **À** | `votre@email.com` |

> **Gmail** : activez l'authentification 2 facteurs, puis générez un [mot de passe d'application](https://myaccount.google.com/apppasswords).

#### Apprise (webhook)

| Champ | Exemple |
|-------|---------|
| **Activer** | ☑ Cocher |
| **URL** | `https://hooks.slack.com/services/XXX/YYY/ZZZ` |
| **Méthode** | `POST` |

---

## Surveiller vos propres logs

### Cas 1 : Logs dans `/var/log`

Déjà montés automatiquement. Dans la GUI, utilisez :
- `/logs/syslog`
- `/logs/kern.log`
- `/logs/auth.log`
- `/logs/daemon.log`

### Cas 2 : Logs d'application personnalisés

Ajoutez un volume dans `docker-compose.yml` :

```yaml
volumes:
  - /home/user/mon-app/logs:/app-logs:ro
```

Redémarrez :

```bash
docker compose up -d
```

Dans la GUI, créez une règle avec le chemin `/app-logs/app.log`.

### Cas 3 : Logs dans un autre conteneur Docker

Partagez un volume nommé :

```yaml
services:
  mon-app:
    volumes:
      - shared-logs:/app/logs

  sentinel:
    volumes:
      - shared-logs:/shared-logs:ro

volumes:
  shared-logs:
```

Dans la GUI, pointez vers `/shared-logs/app.log`.

---

## Comprendre l'architecture

### Base de données SQLite

Trois tables, zéro configuration manuelle :

| Table | Contenu |
|-------|---------|
| `settings` | Tous les paramètres (Ollama, SMTP, Apprise) — 14 clés par défaut |
| `rules` | Vos règles de surveillance (nom, chemin, mots-clés, contexte, debounce) |
| `alerts` | Historique complet des alertes avec réponse IA |

La base est stockée dans le volume Docker `sentinel-data` et persiste entre les redémarrages.

### Moteur de surveillance (`watcher.py`)

- **Boucle** : vérifie chaque règle active chaque seconde
- **Suivi de position** : se souvient de l'endroit où il s'est arrêté dans chaque fichier
- **Détection de rotation** : si l'inode change ou le fichier rétrécit, il recommence au début
- **Anti-flood** : ne déclenche pas plus d'une alerte par règle toutes les N secondes (configurable)
- **Contexte** : envoie les N lignes précédentes au LLM pour un diagnostic pertinent

### Client Ollama (`ollama_client.py`)

- Appelle `/api/generate` (pas `/api/chat`) pour compatibilité maximale
- Timeout de 60 secondes par défaut
- Retourne un message d'erreur lisible si Ollama est injoignable

### Notificateur (`notifier.py`)

- **SMTP** : utilise `aiosmtplib` (async natif, pas de threads)
- **Apprise** : webhook HTTP flexible (POST ou GET)
- Les deux peuvent être activés simultanément

---

## API REST

Tous les paramètres sont modifiables via l'API ou la GUI :

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/settings` | Récupérer tous les paramètres |
| `POST` | `/api/settings` | Sauvegarder `{key: value}` |
| `GET` | `/api/rules` | Lister les règles |
| `POST` | `/api/rules` | Créer une règle |
| `PUT` | `/api/rules/{id}` | Modifier une règle |
| `DELETE` | `/api/rules/{id}` | Supprimer une règle |
| `POST` | `/api/rules/{id}/force-analyze` | Analyse manuelle immédiate |
| `GET` | `/api/alerts` | Historique des alertes |
| `DELETE` | `/api/alerts/{id}` | Supprimer une alerte |
| `DELETE` | `/api/alerts` | Vider tout l'historique |
| `GET` | `/api/status` | État du service |

### Exemples avec curl

```bash
# Voir les paramètres
curl http://localhost:10911/api/settings

# Changer le modèle Ollama
curl -X POST http://localhost:10911/api/settings \
  -H "Content-Type: application/json" \
  -d '{"ollama_model": "mistral"}'

# Créer une règle
curl -X POST http://localhost:10911/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nginx erreurs",
    "log_path": "/logs/nginx/error.log",
    "keywords": ["error", "critical"],
    "context_lines": 15,
    "debounce": 60
  }'

# Voir les alertes
curl http://localhost:10911/api/alerts?limit=10
```

---

## Dépannage

### Le conteneur ne démarre pas

```bash
# Voir les logs
docker compose logs

# Vérifier les permissions sur les logs
ls -la /var/log/syslog
# Si "Permission denied", ajoutez :ro ou vérifiez les droits
```

### "Impossible de joindre Ollama"

```bash
# Depuis le conteneur, tester la connectivité
docker exec sentinel python -c "
import urllib.request
try:
    urllib.request.urlopen('http://host.docker.internal:11434')
    print('OK')
except Exception as e:
    print(e)
"
```

**Solutions :**
1. Vérifiez que Ollama est bien lancé : `ollama list`
2. Vérifiez `extra_hosts` dans `docker-compose.yml`
3. Essayez l'IP directe de votre machine
4. Si Ollama écoute sur `127.0.0.1`, relancez avec `OLLAMA_HOST=0.0.0.0 ollama serve`

### "Fichier introuvable"

Le chemin doit être **dans le conteneur**, pas sur votre machine :

| Sur votre machine | Dans le conteneur | Chemin dans la GUI |
|-------------------|-------------------|-------------------|
| `/var/log/syslog` | `/logs/syslog` | `/logs/syslog` |
| `/home/user/app.log` | (non monté) | ❌ Ajoutez un volume |
| `/home/user/app.log` | `/app-logs/app.log` | `/app-logs/app.log` |

### Les alertes ne se rafraîchissent pas

- Vérifiez que le fichier log est bien écrit (tail -f /var/log/syslog)
- Vérifiez que les mots-clés correspondent (sensibles à la casse ? Non, la recherche est case-insensitive)
- Vérifiez l'anti-flood : si trop bas, les alertes sont ignorées

### La base de données est corrompue

```bash
# Sauvegarder
docker cp sentinel:/app/data/sentinel.db ./sentinel-backup.db

# Recréer
docker compose down
docker volume rm sentinel_sentinel-data
docker compose up -d
```

### Changer le port

Dans `docker-compose.yml` :

```yaml
ports:
  - "8080:10911"   # ← Port hôte:port conteneur
```

La GUI sera alors sur `http://localhost:8080`.

---

## Structure du projet

```
sentinel/
├── Dockerfile              # Image Python 3.12-slim
├── docker-compose.yml      # Orchestration + volumes
├── requirements.txt        # Dépendances Python
├── README.md               # Ce fichier
└── app/
    ├── __init__.py
    ├── main.py             # FastAPI + endpoints REST
    ├── database.py         # SQLite (settings, rules, alerts)
    ├── ollama_client.py    # Client async vers Ollama
    ├── notifier.py         # SMTP + Apprise
    ├── watcher.py          # Moteur de surveillance async
    └── static/
        ├── index.html      # Interface web
        ├── style.css       # Thème sombre GitHub-like
        └── app.js          # Logique frontend (tabs, CRUD, API)
```

---

## Astuces avancées

### Lancer au démarrage du système

```bash
# Copier docker-compose.yml dans un endroit persistant
sudo cp ~/sentinel/docker-compose.yml /etc/sentinel/

# Créer un service systemd
sudo tee /etc/systemd/system/sentinel.service > /dev/null << 'EOF'
[Unit]
Description=Log-to-LLM Sentinel
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/etc/sentinel
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now sentinel
```

### Sauvegarder la base de données

```bash
# Manuel
docker cp sentinel:/app/data/sentinel.db ./backup-$(date +%F).db

# Automatique (cron)
echo "0 2 * * * docker cp sentinel:/app/data/sentinel.db /backup/sentinel-$(date +\%F).db" | crontab -
```

### Utiliser un autre modèle LLM

Dans la GUI → Config IA → changez le modèle. Modèles recommandés :

| Modèle | Taille | Usage RAM | Qualité |
|--------|--------|-----------|---------|
| `llama3.2` | 2 Go | ~2 Go | Bon |
| `mistral` | 4 Go | ~4 Go | Très bon |
| `phi3` | 4 Go | ~4 Go | Excellent |
| `gemma2:9b` | 5.5 Go | ~6 Go | Excellent |

---

## Licence

MIT — utilisez, modifiez, partagez librement.

---

## Besoin d'aide ?

1. Vérifiez les logs : `docker compose logs -f`
2. Testez l'API : `curl http://localhost:10911/api/status`
3. Vérifiez Ollama : `ollama list`
4. Consultez la section [Dépannage](#dépannage) ci-dessus
