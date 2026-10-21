# Backend NestJS — IHM de validation PIM Accor

API lue par le front (relais Next.js `/api/*`) : liste et détail des fiches, rapprochements, décisions des relecteurs,
export. Contrat : [docs/api-contract.md](docs/api-contract.md). Règles métier : `pipeline/docs/contrat-back.md` et
`pipeline/docs/tables-et-validation.md`.

- NestJS 12 (ESM), TypeScript strict, Node 24.
- Toutes les requêtes SQL sont dans `src/repository.ts` (paramètres nommés uniquement) ; les contrôleurs dépendent de la
  classe abstraite `Repository`, remplacée par un mock dans les tests.
- Écritures BigQuery : uniquement des `INSERT` dans `validation.match_decisions` et `validation.enrichment_decisions`.

## Configuration

| Variable                                                              | Exemple (dev)                                    |
| --------------------------------------------------------------------- | ------------------------------------------------ |
| `GCP_PROJECT_ID`                                                      | `cvto-accor-pim-enrichment-dev`                  |
| `REGION`                                                              | `europe-west1`                                   |
| `BQ_MATCHING_DATASET`, `BQ_ENHANCED_DATASET`, `BQ_VALIDATION_DATASET` | `cvto_accor_pim_enrichment_dev_euw1_matching`…   |
| `EXPORT_JOB`                                                          | `gcrj-cvto-accor-pim-enrichment-dev-euw1-export` |
| `EXPORTS_BUCKET`                                                      | `bkt-cvto-accor-pim-enrichment-dev-euw1-exports` |
| `PORT`                                                                | injecté par Cloud Run (8080) ; `3101` en local   |
| `GOOGLE_IMPERSONATE_SERVICE_ACCOUNT`                                  | local uniquement, voir ci-dessous                |

Une variable manquante arrête le démarrage avec son nom dans le message.

## Développement local

Les comptes humains n'ont que `viewer` sur BigQuery (pas de `jobs.create`) : en local, le back agit au nom d'un compte de
service à partir de vos ADC. Il faut le rôle `roles/iam.serviceAccountTokenCreator` sur ce SA (à demander ; cible :
`sa-dev-backend`, aujourd'hui seul `sa-dev-terraform` est impersonnable).

```bash
gcloud auth application-default login
cd backend
cp .env.example .env          # valeurs de dev, GOOGLE_IMPERSONATE_SERVICE_ACCOUNT compris
npm ci
npm run dev                   # http://localhost:3101/healthz
```

Back et front ensemble (depuis la racine du repo) :

```bash
docker compose up --build     # back sur :3101, front sur :8080 (FRONTEND_PORT / BACKEND_PORT pour changer)
```

Le conteneur du back lit `backend/.env` et vos ADC (`~/.config/gcloud`, en lecture seule). Le front appelle le back en
direct (`BACKEND_URL=http://backend:8080`), sans jeton ; l'auteur des décisions est `DEV_AUTHOR`
(`test@converteo.com` par défaut).

## Tests

```bash
npm run lint                  # ESLint, Prettier, tsc
npm test                      # tests unitaires, sans BigQuery
npm run test:integration      # + tests de lecture contre BigQuery dev (BQ_INTEGRATION=1, impersonation)
```

En CI, l'étape `back-tests` de `cloudbuild.yaml` lance lint et tests avant de construire l'image.

Écritures de test réelles : en **dev uniquement**, avec `X-PIM-Author: test@converteo.com` et un commentaire commençant
par `TEST`. Jamais en stg.
