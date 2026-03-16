# FleetBid Deploy Handoff

## Context

- Production domain: `https://fleetbid.ae`
- Server IP: `152.42.128.106`
- Project path on server: `/app`
- Main deploy branch right now: `codex/newback`
- Stack:
  - `frontend` - Next.js
  - `backend` - Fastify
  - `postgres` - Docker PostgreSQL
  - `caddy` - reverse proxy and SSL

The domain already points to this VPS. After a successful deploy, the live site and API are available at:

- `https://fleetbid.ae`
- `https://fleetbid.ae/api/health`

## Important Notes

- Run all `docker compose` commands on the server inside `/app`.
- Do not run `ssh ...` from inside an already open SSH session.
- If `git pull` fails because of local changes on the server, stash first.
- Do not use `--remove-orphans` unless you explicitly want to clean up containers and understand the impact.

## Standard Deploy Flow

### 1. Connect to the server

```bash
ssh root@152.42.128.106
```

### 2. Go to the project

```bash
cd /app
```

### 3. Save any local changes on the server

```bash
git stash push -u -m "pre-deploy" || true
```

### 4. Pull the target branch

```bash
git fetch origin
git checkout codex/newback
git pull origin codex/newback
```

### 5. Rebuild and restart the stack

```bash
docker compose up --build -d --force-recreate
```

## Partial Rebuild Commands

### Rebuild backend only

```bash
cd /app
docker compose up -d --build backend
```

### Rebuild backend and frontend only

```bash
cd /app
docker compose up -d --build backend frontend
```

## Post-Deploy Checks

### Check containers

```bash
docker compose ps
```

Expected core containers:

- `app-frontend-1`
- `app-backend-1`
- `fleetbid-postgres`
- `app-caddy-1`

### Check frontend response

```bash
curl -I https://fleetbid.ae
```

Expected:

- `HTTP/2 307`
- redirect to `/en`

### Check backend health

```bash
curl https://fleetbid.ae/api/health
```

Expected:

```json
{"status":"ok","timestamp":"..."}
```

### Check logs if needed

```bash
docker compose logs --tail=100 backend
docker compose logs --tail=100 frontend
```

## If `git pull` Fails

If you see:

```text
Your local changes to the following files would be overwritten by merge
```

Run:

```bash
cd /app
git stash push -u -m "pre-deploy"
git pull origin codex/newback
```

## Admin Access

### Default admin login

- Email: `admin@fleetbid.ae`
- Password: `Admin1234!`

### If admin login does not work

Run this on the server:

```bash
cd /app
docker compose exec backend node -e 'const bcrypt=require("bcryptjs");const {PrismaClient}=require("@prisma/client");const prisma=new PrismaClient();(async()=>{const email="admin@fleetbid.ae";const password="Admin1234!";const passwordHash=await bcrypt.hash(password,12);const user=await prisma.user.upsert({where:{email},update:{passwordHash,role:"ADMIN",status:"ACTIVE"},create:{email,passwordHash,role:"ADMIN",status:"ACTIVE"}});console.log("ADMIN_READY",user.email,user.role,user.status);})().catch(e=>{console.error(e);process.exit(1)}).finally(async()=>{await prisma.$disconnect();});'
```

## Manual Smoke Test URLs

- `https://fleetbid.ae`
- `https://fleetbid.ae/login`
- `https://fleetbid.ae/register/seller`
- `https://fleetbid.ae/register/buyer`
- `https://fleetbid.ae/admin`
- `https://fleetbid.ae/api/health`

## One-Block Deploy Command

Use this when you want the shortest safe deploy flow:

```bash
ssh root@152.42.128.106
cd /app
git stash push -u -m "pre-deploy" || true
git fetch origin
git checkout codex/newback
git pull origin codex/newback
docker compose up --build -d --force-recreate
docker compose ps
curl -I https://fleetbid.ae
curl https://fleetbid.ae/api/health
```

## Common Mistake

This will fail on a local Mac:

```bash
cd /app
docker compose up -d --build backend
```

Why:

- `/app` exists on the VPS, not on the local machine.
- You must `ssh` into the server first.
