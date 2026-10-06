# Terraform — PIM Accor enrichment (GCP)

Projet `cvto-accor-pim-enrichment-dev` · région `europe-west1` (euw1) · environnements **dev** et **stg** (même projet).
Toutes les opérations passent par l'impersonation de `sa-dev-terraform@cvto-accor-pim-enrichment-dev.iam.gserviceaccount.com`.

## Arborescence

```
terraform/
├── config/                         backend GCS par environnement (bucket, préfixe, impersonation)
│   ├── terraform_dev_backend.hcl   → préfixe core/dev
│   └── terraform_stg_backend.hcl   → préfixe core/stg
├── core/                           module racine unique, paramétré par env
│   ├── backend.tf  main.tf  outputs.tf  providers.tf  variables.tf  versions.tf
├── modules/
│   ├── apis/                       activation d'APIs (jamais désactivées au destroy)
│   ├── artifact_registry/          dépôt Docker + politiques de nettoyage
│   ├── cloud_run/                  service Cloud Run v2 + IAM invoker
│   ├── cloud_storage/              bucket (UBLA, public access prevention, versioning, lifecycle) + IAM
│   └── iam/                        service accounts + bindings projet additifs
├── vars/
│   ├── global.tfvars               valeurs communes (projet, région, client, solution, labels, APIs)
│   ├── dev.tfvars
│   └── stg.tfvars
├── Makefile
└── README.md
```

## Ressources par environnement

| Ressource | dev | stg |
|---|---|---|
| Cloud Run front (public) | `gcr-cvto-accor-pim-enrichment-dev-euw1-front` | `gcr-cvto-accor-pim-enrichment-stg-euw1-front` |
| Cloud Run back (privé) | `gcr-cvto-accor-pim-enrichment-dev-euw1-back` | `gcr-cvto-accor-pim-enrichment-stg-euw1-back` |
| Bucket fichiers PIM | `bkt-cvto-accor-pim-enrichment-dev-euw1-pim-files` | `bkt-cvto-accor-pim-enrichment-stg-euw1-pim-files` |
| Bucket fichiers Expedia / Booking | `bkt-cvto-accor-pim-enrichment-dev-euw1-ota-files` | `bkt-cvto-accor-pim-enrichment-stg-euw1-ota-files` |
| Artifact Registry | `ar-cvto-accor-pim-enrichment-dev-euw1-docker` | `ar-cvto-accor-pim-enrichment-stg-euw1-docker` |
| SA d'exécution | `sa-dev-frontend`, `sa-dev-backend` | `sa-stg-frontend`, `sa-stg-backend` |

Ressources uniques au projet, gérées **uniquement par dev** (`manage_project_resources = true`) :
- bucket de state `bkt-cvto-accor-pim-enrichment-dev-euw1-tfstate` (versionné, 20 versions conservées) ;
- rôles complémentaires du SA Terraform (`terraform_sa_extra_roles` : `run.admin`, `artifactregistry.admin`, `secretmanager.admin`,
  nécessaires car `editor` ne permet pas de poser de l'IAM au niveau d'une ressource) ;
- secret du token GitHub et connexion Cloud Build ↔ GitHub.

URLs :
- dev : https://gcr-cvto-accor-pim-enrichment-dev-euw1-front-ibibg7vx6q-ew.a.run.app
- stg : https://gcr-cvto-accor-pim-enrichment-stg-euw1-front-ibibg7vx6q-ew.a.run.app

Sécurité :
- front public (`front_public = true`) ; back privé : seul le SA front a `roles/run.invoker`
  (l'URL du back est injectée dans le front via `BACKEND_URL`) ;
- SA back : `roles/storage.objectAdmin` sur les 2 buckets de fichiers (noms injectés : `PIM_FILES_BUCKET`, `OTA_FILES_BUCKET`) ;
- buckets : accès uniforme, accès public bloqué, versioning, anciennes versions supprimées après 30 jours.

## Conventions de nommage

| Type | Format | Contraintes |
|---|---|---|
| Cloud Run | `gcr-cvto-[client]-[solution]-[env]-[region]-[service]` | minuscules/chiffres/tirets ; 63 max (49 en pratique pour Cloud Run v2, contrôlé dans le module) |
| Bucket | `bkt-cvto-[client]-[solution]-[env]-[region]-[purpose]` | globalement unique, ni majuscule ni underscore, 63 max |

Avec `client = accor`, `solution = pim-enrichment` (`vars/global.tfvars`).

## Prérequis

```bash
brew install terraform                  # >= 1.9
gcloud auth login
gcloud auth application-default login   # identifiants utilisés par Terraform
```

## Utilisation

```bash
cd terraform
make init  ENV=dev      # (re)configure le backend sur core/dev
make plan  ENV=dev      # écrit core/tfplan_dev
make apply ENV=dev
make output ENV=dev

make init plan ENV=stg && make apply ENV=stg
```

> `make init` fait un `-reconfigure` : toujours relancer `init` en changeant d'environnement.

### Déployer une nouvelle version de l'application

Plus de script : le déploiement applicatif est fait par **Cloud Build** (`cloudbuild.yaml` à la racine du repo).

| Branche | Trigger | Déploie |
|---|---|---|
| `dev` | `gcb-cvto-accor-pim-enrichment-dev-euw1-deploy` | `gcr-…-dev-euw1-front` (et `-back` si `backend/Dockerfile` existe) |
| `stg` | `gcb-cvto-accor-pim-enrichment-stg-euw1-deploy` | `gcr-…-stg-euw1-front` (et `-back`) |

Images taguées `<sha court du commit>` et `<env>` dans l'Artifact Registry de l'env.
Terraform crée les services avec une image de démarrage puis **ignore l'image** (`lifecycle.ignore_changes`) :
un `make apply` n'annule jamais un déploiement de la CI.

Un push qui ne modifie que `terraform/**`, de la doc (`*.md`, `docs/**`), `renovate.json` ou `docker-compose.yml` ne déclenche pas de build.

CI : SA `sa-<env>-cloudbuild` (droits minimaux : écrire dans l'AR de son env, `run.developer` sur ses 2 Cloud Run,
agir en tant que leurs SA d'exécution, écrire des logs). Connexion GitHub : `gcb-cvto-accor-pim-enrichment-euw1-github`
(app GitHub « Google Cloud Build » + token dans le secret `sec-cvto-accor-pim-enrichment-github-token`, gérés par dev).

Guide pas à pas : [docs/ci-cd-cloud-build.html](docs/ci-cd-cloud-build.html).

Backend : pas encore de code, les services tournent avec l'image de démo Google (`back_image_tag = null`).
