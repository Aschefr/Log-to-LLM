# 🛡️ Log-to-LLM Sentinel

Surveillez vos fichiers logs en temps réel, analysez les anomalies avec un LLM local (Ollama) et recevez des notifications par email ou Apprise.

---

## 📋 Fonctionnalités

- **Surveillance en temps réel** de fichiers logs montés en volumes Docker
- **Analyse IA** via Ollama (LLM local)
- **Notifications** SMTP et Apprise (Telegram, Discord, Slack, etc.)
- **Navigateur de fichiers** intégré pour sélectionner vos logs
- **Mots-clés pré-configurés** + personnalisables
- **Mode "Je ne sais pas"** — déclenche sur toute nouvelle ligne
- **Anti-flood** configurable par règle
- **Interface web** sombre et responsive

---

## 🚀 Installation pas à pas

### 1. Prérequis

Vous avez besoin de :

- Un serveur Linux (Ubuntu, Debian, etc.)
- **Docker** et **Docker Compose** installés
- **Git** installé
- (Optionnel) **Ollama** pour l'analyse IA

### 2. Installer Docker

Si Docker n'est pas encore installé sur votre serveur :

```bash
# Télécharger et exécuter le script officiel d'installation
curl -fsSL https://get.docker.com | sudo sh

# Ajouter votre utilisateur au groupe docker (pour éviter de taper sudo à chaque fois)
sudo usermod -aG docker $USER

# Déconnectez-vous et reconnectez-vous pour appliquer le changement
```

Vérifiez que Docker fonctionne :

```bash
docker --version
docker compose version
```

### 3. Installer Git

```bash
sudo apt update && sudo apt install -y git
```

### 4. Cloner le dépôt

```bash
git clone https://github.com/Aschefr/Log-to-LLM-Sentinel.git
cd Log-to-LLM-Sentinel
```

### 5. Configurer les volumes de logs

Éditez le fichier `docker-compose.yml` pour monter les dossiers de logs que vous souhaitez surveiller :

```yaml
volumes:
  - sentinel-data:/app/data
  - /var/log:/logs:ro
  # Décommentez et adaptez selon vos besoins :
  # - /var/log/nginx:/nginx-logs:ro
  # - /home/user/mon-app/logs:/app-logs:ro
```

> **💡 Astuce** : Les chemins de gauche sont ceux de votre serveur, les chemins de droite sont ceux que vous verrez dans l'interface web.

### 6. Démarrer l'application

```bash
docker compose up -d --build
```

Cela va :
1. Construire l'image Docker
2. Créer les volumes
3. Démarrer le conteneur en arrière-plan

### 7. Accéder à l'interface

Ouvrez votre navigateur et rendez-vous sur :

```
http://votre-serveur:10911
```

> **⚠️ Firewall** : Si votre serveur a un pare-feu, ouvrez le port 10911 :
> ```bash
> sudo ufw allow 10911/tcp
> ```

---

## 🧠 Configurer Ollama (optionnel mais recommandé)

Ollama permet d'analyser les logs avec une IA locale.

### Option A : Ollama sur la machine hôte

1. Installez Ollama sur votre serveur :

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

2. Téléchargez un modèle :

```bash
ollama pull llama3.2
```

3. Dans l'interface Sentinel → **Config IA** :
   - Adresse : `http://localhost:11434`
   - Modèle : `llama3.2`

4. Décommentez cette ligne dans `docker-compose.yml` :

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

Puis redémarrez : `docker compose up -d`

### Option B : Ollama dans un conteneur Docker

Décommentez la section Ollama dans `docker-compose.yml` et redémarrez.

---

## 📬 Configurer les notifications

### Email (SMTP)

Dans l'onglet **Notifications** → **Email (SMTP)** :

| Champ | Exemple Gmail |
|-------|--------------|
| Serveur | `smtp.gmail.com` |
| Port | `587` |
| TLS | ✅ Coché |
| Utilisateur | `votre@email.com` |
| Mot de passe | Mot de passe d'application |
| De | `votre@email.com` |
| À | `votre@email.com` |

> **Gmail** : utilisez un [mot de passe d'application](https://myaccount.google.com/apppasswords), pas votre mot de passe habituel.

### Apprise (Telegram, Discord, Slack…)

Dans l'onglet **Notifications** → **Apprise** :

| Service | URL exemple |
|---------|-----------|
| Telegram | `tgram://botToken/chatId` |
| Discord | `discord://webhookID/webhookToken` |
| Slack | `slack://tokenA/tokenB/tokenC` |

---

## 📝 Créer une règle de surveillance

1. Onglet **Règles** → **+ Nouvelle Règle**
2. Donnez un nom (ex: "Logs Nginx")
3. Naviguez dans les fichiers pour sélectionner votre log
4. Cochez les mots-clés ou activez **"Je ne sais pas"**
5. Ajustez l'anti-flood (par défaut 30 secondes)
6. Cliquez **💾 Enregistrer**

---

## 🔄 Mise à jour depuis le dépôt

### 1. Récupérer les dernières modifications

```bash
cd Log-to-LLM-Sentinel
git pull
```

### 2. Reconstruire et redémarrer

```bash
docker compose up -d --build
```

> **⚠️ Important** : Les données (règles, alertes, configuration) sont persistées dans le volume `sentinel-data`. Elles ne seront **pas perdues** lors d'une mise à jour.

### 3. Vérifier que tout fonctionne

```bash
docker compose logs -f
```

---

## 🛠️ Commandes utiles

```bash
# Voir les logs du conteneur
docker compose logs -f

# Arrêter l'application
docker compose down

# Redémarrer après modification du docker-compose.yml
docker compose up -d

# Supprimer tout (données incluses)
docker compose down -v
```

---

## ⚙️ Configuration avancée

### Changer le port

Modifiez dans `docker-compose.yml` :

```yaml
ports:
  - "8080:10911"
```

L'interface sera alors accessible sur `http://votre-serveur:8080`

### Persistance des données

Les données sont stockées dans le volume Docker `sentinel-data`. Pour les sauvegarder :

```bash
docker run --rm -v sentinel-data:/data -v $(pwd):/backup alpine tar czf /backup/sentinel-backup.tar.gz -C /data .
```

Pour restaurer :

```bash
docker run --rm -v sentinel-data:/data -v $(pwd):/backup alpine tar xzf /backup/sentinel-backup.tar.gz -C /data
```

---

## 📁 Structure du projet

```
Log-to-LLM-Sentinel/
├── app/
│   ├── main.py          # API FastAPI
│   ├── database.py      # SQLite + SQLAlchemy
│   ├── watcher.py       # Surveillance des logs
│   ├── notifier.py      # Notifications SMTP/Apprise
│   ├── ai.py            # Analyse Ollama
│   └── static/
│       ├── index.html   # Interface web
│       ├── style.css    # Styles
│       └── app.js       # JavaScript
├── docker-compose.yml
├── Dockerfile
└── README.md
```

---

## 🔑 Ports

| Port | Service |
|------|---------|
| 10911 | Interface web + API |

---

## 📝 Licence

MIT
