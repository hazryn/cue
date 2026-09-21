# Wdrożenie na serwer (k3s)

```bash
# 1. Sekrety (raz; nie trafiają do repo)
kubectl --context serwer create secret generic cue-secrets -n cue \
  --from-literal=DB_PASSWORD='...' \
  --from-literal=ADMIN_PASSWORD='...' \
  --from-literal=ADMIN_TOKEN_SECRET="$(openssl rand -hex 32)"

# 2. Obraz
docker build --target prod -t registry.example.com/cue/app:$(date +%Y%m%d-%H%M) -t registry.example.com/cue/app:latest .
docker push registry.example.com/cue/app --all-tags

# 3. Manifesty
kubectl --context serwer apply -f deploy/k8s/

# 4. Wypełnienie katalogu pytaniami (idempotentne)
kubectl --context serwer exec -n cue deploy/app -- node backend/dist/catalog/seed/run-seed.js
```

Migracje wykonują się same przy starcie kontenera (`migrationsRun`).
Baza to współdzielony Postgres z namespace `postgres`, użytkownik i baza `cue`.
