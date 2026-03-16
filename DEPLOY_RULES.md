# DEPLOY_RULES.md — FleetBid Production Deployment Rules

## Status: MANDATORY

All agents (Codex, Cursor, or any automated process) MUST read this file before
any deploy-related task. This document supersedes any deploy instructions found
elsewhere in the codebase. Violations of these rules have caused production outages.

---

## Production Architecture

| Service   | Port | Role                                        |
|-----------|------|---------------------------------------------|
| frontend  | 3000 | Next.js UI                                  |
| backend   | 4000 | Fastify API                                 |
| postgres  | 5432 | PostgreSQL database                         |
| caddy     | 80/443 | Reverse proxy + TLS (Let's Encrypt)       |

- Server: DigitalOcean VPS, IP `152.42.128.106`, app path `/app`
- Domain: `https://fleetbid.ae`
- API: `https://api.fleetbid.ae` → backend:4000
- Branch used for production deploys: `codex/newback`

---

## FORBIDDEN — Never Run These in Production

These commands have caused downtime and MUST NOT be used:

```bash
# FORBIDDEN: destroys all containers including working caddy/proxy
docker compose up --build -d --force-recreate

# FORBIDDEN: removes all Docker images including currently serving ones
docker system prune -a

# FORBIDDEN: stops everything including caddy, causes immediate 502
docker compose down
```

If you find yourself about to run any of these — stop and re-read this file.

---

## Safe Deploy — App Only (frontend + backend)

Use this for every regular code deploy:

```bash
cd /app
git pull origin codex/newback

# Build only the app services — never caddy or postgres
docker compose build frontend backend

# Restart only the rebuilt services — never touch caddy
docker compose up -d --no-deps frontend backend

# Health checks — always run after deploy
sleep 5
curl -sf http://localhost:3000/api/health && echo "Frontend OK"
curl -sf http://localhost:4000/api/health && echo "Backend OK"
curl -sf https://fleetbid.ae/api/health && echo "Public OK"
```

The `--no-deps` flag ensures caddy is never accidentally stopped or recreated.

---

## Safe Deploy — Proxy Config Only

Use this ONLY when `Caddyfile` has changed (rare):

```bash
cd /app
git pull origin codex/newback

# Verify Caddyfile is a file, not a directory
ls -la /app/Caddyfile

# Restart only caddy
docker compose up -d --no-deps caddy

# Verify
curl -I https://fleetbid.ae
```

---

## Rollback

```bash
# Find the last known good commit
git log --oneline -10

# Check out that commit
git checkout <previous-working-commit-hash>

# Redeploy app services only
docker compose build frontend backend
docker compose up -d --no-deps frontend backend

# Health check
curl https://fleetbid.ae/api/health
```

---

## Pre-Deploy Checklist

Run all checks before every deploy:

```bash
# 1. Caddyfile must be a FILE, not a directory
ls -la /app/Caddyfile
# Expected: line starts with -rw (file). BAD: starts with drw (directory)

# 2. Disk space must be below 70%
df -h
df -i  # also check inodes

# 3. All containers must be Up
docker ps --format "table {{.Names}}\t{{.Status}}"
# Expected: app-caddy-1, app-frontend-1, app-backend-1, app-postgres-1 all Up

# 4. Run health check before touching anything
curl https://fleetbid.ae/api/health
```

---

## Caddy Rules (MANDATORY)

1. `caddy` MUST always be defined in `docker-compose.yml` — never an orphan container.
2. `caddy_data` and `caddy_config` MUST be named volumes (not bind-mounts). This preserves TLS certificates across container recreation.
3. Never recreate caddy unless `Caddyfile` has changed.
4. `Caddyfile` MUST always exist as a file in the git repo root.
5. If `/app/Caddyfile` is a directory on the server — caddy will fail to start. Fix:
   ```bash
   mv /app/Caddyfile /app/Caddyfile.broken.bak
   # Then git pull to restore the correct file from repo
   git pull origin codex/newback
   ```

---

## docker-compose.yml — Required caddy Service Definition

The caddy service in `docker-compose.yml` MUST match this structure:

```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - frontend
      - backend
    networks:
      - app-network

volumes:
  caddy_data:
  caddy_config:
```

Do NOT use bind-mounts for caddy_data or caddy_config — this destroys TLS certs on recreate.

---

## If Build Fails with Docker Layer Extraction Errors

Symptom: `failed to extract layer` / `failed to Lchown ... no such file or directory`

This is a corrupted Docker build cache, not a code bug. Fix:

```bash
# Clear only build cache — safe to run while containers are up
docker builder prune -f
docker image prune -f

# Then retry safe deploy
docker compose build frontend backend
docker compose up -d --no-deps frontend backend
```

---

## Required Caddyfile Content

The `Caddyfile` in the repo root must contain exactly:

```
fleetbid.ae {
    reverse_proxy frontend:3000
}

api.fleetbid.ae {
    reverse_proxy backend:4000
}
```

Do not modify this unless adding a new subdomain. Any change to routing requires
restarting caddy using the proxy-only deploy procedure above.

---

## Why These Rules Exist

On March 16–17, 2026, FleetBid had a production outage caused by:

1. `caddy` was not managed by `docker-compose.yml` — it was an orphan container.
2. `Caddyfile` was not in git — server state was not reproducible.
3. `docker compose up --build -d --force-recreate` was used — it destroyed the working
   proxy, frontend failed to rebuild (OOM on VPS), and caddy had no target → 502.
4. Docker auto-created `/app/Caddyfile` as a directory (default Docker behavior when
   bind-mount source is missing), which prevented caddy from starting.

These rules exist to prevent this class of failure permanently.
