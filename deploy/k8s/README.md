# Wdrożenie na Kubernetes

Manifesty w tym katalogu to baza z przykładowymi wartościami
(`druzynada.example.com`, `registry.example.com`). Własne wartości trzymaj
w nakładce kustomize **poza repozytorium** — katalog `deploy/local/` jest
wykluczony z gita właśnie w tym celu.

## 1. Nakładka z własną domeną i obrazem

`deploy/local/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../k8s
images:
  - name: registry.example.com/druzynada/app
    newName: registry.twoja-domena.pl/druzynada/app
    newTag: latest
patches:
  - target: { kind: Ingress, name: cue }
    patch: |-
      - op: replace
        path: /spec/rules/0/host
        value: gra.twoja-domena.pl
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: app
        namespace: cue
      spec:
        template:
          spec:
            containers:
              - name: app
                env:
                  - name: PUBLIC_URL
                    value: https://gra.twoja-domena.pl
```

Jeśli registry wymaga logowania, utwórz w namespace `cue` sekret
`registry-pull` typu `docker-registry` — Deployment już się do niego odwołuje.

## 2. Sekrety (raz; nie trafiają do repo)

```bash
kubectl create namespace cue
kubectl create secret generic cue-secrets -n cue \
  --from-literal=DB_PASSWORD='...' \
  --from-literal=ADMIN_PASSWORD='...' \
  --from-literal=ADMIN_TOKEN_SECRET="$(openssl rand -hex 32)"
```

Adres bazy (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`) ustawia `deployment.yaml`
— domyślnie Postgres w namespace `postgres`; zmień go w nakładce, jeśli trzymasz
bazę gdzie indziej.

## 3. Obraz i wdrożenie

```bash
TAG=$(git rev-parse --short HEAD)
docker build --target prod -t registry.twoja-domena.pl/druzynada/app:$TAG \
  -t registry.twoja-domena.pl/druzynada/app:latest .
docker push registry.twoja-domena.pl/druzynada/app --all-tags

kubectl apply -k deploy/local
kubectl rollout restart deploy/app -n cue

# pytania startowe (idempotentne)
kubectl exec -n cue deploy/app -- node backend/dist/catalog/seed/run-seed.js
```

Migracje wykonują się same przy starcie kontenera.

Ingress zakłada Traefika i HTTP na wejściu (`entrypoints: web`) — TLS terminuje
reverse proxy przed klastrem. Jeśli certyfikaty wystawiasz w samym klastrze
(np. cert-manager), dopisz w nakładce sekcję `tls` do Ingressu.
