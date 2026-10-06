# pim_accor_enrichment

Interface de validation des enrichissements de fiches établissement (PIM Accor).

## Structure

```
frontend/            Next.js 16 (App Router, next-intl FR/EN), design ALL Accor
  Dockerfile         image de production multi-étapes (build standalone, utilisateur non-root)
terraform/           infrastructure GCP dev + stg (Cloud Run front/back, buckets, Artifact Registry) — voir terraform/README.md
cloudbuild.yaml      pipeline CI/CD (Cloud Build) : build + déploiement Cloud Run sur push dev / stg
renovate.json        mises à jour automatiques (npm, Dockerfile, providers Terraform)
docker-compose.yml   lancement local de la stack
```

## Lancer avec Docker

```bash
docker compose up -d --build
# → http://localhost:8080  (anglais : http://localhost:8080/en)
# autre port : FRONTEND_PORT=3005 docker compose up -d
docker compose logs -f frontend
docker compose down
```

Le conteneur écoute sur `$PORT` (8080 par défaut), ce qui correspond au contrat Cloud Run.

## Développement sans Docker

```bash
cd frontend
npm ci
npm run dev      # http://localhost:3000
npm run check    # règles métier
npm run build    # build de production (standalone)
```

## Déploiement GCP

Projet `cvto-accor-pim-enrichment-dev`, région `europe-west1`, Cloud Run.

- URL dev : https://gcr-cvto-accor-pim-enrichment-dev-euw1-front-ibibg7vx6q-ew.a.run.app
- URL stg : https://gcr-cvto-accor-pim-enrichment-stg-euw1-front-ibibg7vx6q-ew.a.run.app
- Nouvelle version : push sur la branche `dev` (déploie dev) ou `stg` (déploie stg), via Cloud Build
- Process expliqué pas à pas : [terraform/docs/ci-cd-cloud-build.html](terraform/docs/ci-cd-cloud-build.html)

## Branches

```
feature/xxx ──PR──▶ dev ──PR──▶ stg ──PR──▶ main
                     │            │           │
                 déploie dev  déploie stg  référence stable (pas de déploiement pour l'instant)
```
- Détails : [terraform/README.md](terraform/README.md)
