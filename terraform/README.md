# Terraform — PIM Accor enrichment (GCP)

Projet `<projet-gcp>` · région `europe-west1` (euw1) · environnements **dev** et **stg** (même projet).
Toutes les opérations passent par l'impersonation de `sa-dev-terraform@<projet-gcp>.iam.gserviceaccount.com`.

## Arborescence

```
terraform/
├── core/                           module racine unique ; un workspace Terraform = un environnement (dev, stg)
│   ├── backend.tf                  backend GCS : un state par workspace (core/dev.tfstate, core/stg.tfstate)
│   ├── terraform.tfvars            valeurs communes + réglages par environnement (environments.dev, environments.stg)
│   ├── main.tf  outputs.tf  providers.tf  variables.tf  versions.tf
│   └── pipeline.tf                 pipeline d'enrichissement (voir pipeline/README.md)
├── modules/
│   ├── apis/                       activation d'APIs (jamais désactivées au destroy)
│   ├── artifact_registry/          dépôt Docker + politiques de nettoyage
│   ├── cloud_run/                  service Cloud Run v2 + IAM invoker
│   ├── cloud_run_job/              job Cloud Run v2 + IAM (étapes du pipeline)
│   ├── cloud_storage/              bucket (UBLA, public access prevention, versioning, lifecycle) + IAM
│   └── iam/                        service accounts + bindings projet additifs
└── README.md
```

## Ressources par environnement

| Ressource | dev | stg |
|---|---|---|
| Cloud Run front (public) | `gcr-cvto-accor-pim-enrichment-dev-euw1-front` | `gcr-cvto-accor-pim-enrichment-stg-euw1-front` |
| Cloud Run back (privé) | `gcr-cvto-accor-pim-enrichment-dev-euw1-back` | `gcr-cvto-accor-pim-enrichment-stg-euw1-back` |
| Bucket fichiers PIM | `bkt-cvto-accor-pim-enrichment-dev-euw1-pim-files` | `bkt-cvto-accor-pim-enrichment-stg-euw1-pim-files` |
| Bucket fichiers Expedia / Booking (OTA) | `bkt-cvto-accor-pim-enrichment-dev-euw1-ota-files` | `bkt-cvto-accor-pim-enrichment-stg-euw1-ota-files` |
| Bucket sources de build (CI) | `bkt-cvto-accor-pim-enrichment-dev-euw1-build-sources` | `bkt-cvto-accor-pim-enrichment-stg-euw1-build-sources` |
| Artifact Registry | `ar-cvto-accor-pim-enrichment-dev-euw1-docker` | `ar-cvto-accor-pim-enrichment-stg-euw1-docker` |
| SA | `sa-dev-frontend`, `sa-dev-backend`, `sa-dev-cloudbuild` | `sa-stg-frontend`, `sa-stg-backend`, `sa-stg-cloudbuild` |

Pipeline d'enrichissement (`core/pipeline.tf`), par environnement : 4 datasets BigQuery
(`cvto_accor_pim_enrichment_<env>_euw1_{raw,matching,validation,enhanced}`) avec tables et vues, base Firestore
`fs-…`, secret de la clé API du PIM, 5 jobs `gcrj-…-{extract-pim,matching,judge,enrich,export}`, service
`gcr-…-load-bq` déclenché par Eventarc sur le bucket OTA, workflow `wf-…-enrichment`, planificateur (en pause),
buckets `bkt-…-prompts` et `bkt-…-exports`, un SA par composant. Le SA back lit les vues et écrit les décisions
(`pipeline/docs/contrat-back.md`).

Ressources uniques au projet, gérées **uniquement par dev** (`manage_project_resources = true`) :
- bucket de state `bkt-cvto-accor-pim-enrichment-dev-euw1-tfstate` (versionné, 20 versions conservées) ;
- rôles complémentaires du SA Terraform (`terraform_sa_extra_roles` : `run.admin`, `artifactregistry.admin`,
  `iam.workloadIdentityPoolAdmin`, `bigquery.admin`, `secretmanager.admin`, nécessaires car `editor` ne permet ni l'IAM au niveau d'une ressource ni la création d'un pool WIF) ;
- pool Workload Identity Federation pour GitHub Actions ;
- droit `pubsub.publisher` de l'agent Cloud Storage (événements de dépôt lus par Eventarc).

URLs : `terraform output front_url` dans le workspace voulu.

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

Avec `client = accor`, `solution = pim-enrichment` (`core/terraform.tfvars`).

## Prérequis

```bash
tfenv install 1.9.8 && tfenv use 1.9.8  # >= 1.9 (Homebrew ne distribue plus Terraform : tfenv ou hashicorp/tap/terraform)
gcloud auth login
gcloud auth application-default login   # identifiants utilisés par Terraform
```

## Utilisation

Un workspace Terraform par environnement. `core/terraform.tfvars` est chargé automatiquement : aucune option à passer.

```bash
cd terraform/core
terraform init                    # une seule fois
terraform workspace select dev    # ou stg ; `terraform workspace show` pour vérifier
terraform plan -out=tfplan
terraform apply tfplan
terraform output
```

- L'environnement vient du workspace (`local.env = terraform.workspace`), ses réglages de `environments[<workspace>]`.
- Le workspace `default` n'est pas un environnement : un plan y échoue (`Invalid index`), rien n'est créé.
- Ajouter un réglage propre à un environnement : un attribut de l'objet `environments` (`core/variables.tf`), avec sa
  valeur par défaut.

### Migration depuis les states par préfixe (une seule fois)

Avant ce passage aux workspaces, les states étaient sous `core/dev/default.tfstate` et `core/stg/default.tfstate`.
Le backend GCS range un workspace `<ws>` sous `core/<ws>.tfstate` :

```bash
B=gs://bkt-cvto-accor-pim-enrichment-dev-euw1-tfstate
# copie (les anciens states restent en place, et le bucket est versionné)
gcloud storage cp $B/core/dev/default.tfstate $B/core/dev.tfstate
gcloud storage cp $B/core/stg/default.tfstate $B/core/stg.tfstate

cd terraform/core
rm -rf .terraform && terraform init
terraform workspace list          # doit lister dev et stg
terraform workspace select dev && terraform plan   # seules les ressources du pipeline sont à créer
terraform workspace select stg && terraform plan   # idem
```

Ne lancer la copie que si personne n'applique en même temps. Les anciens objets `core/dev/` et `core/stg/` peuvent
être supprimés une fois les deux plans vérifiés.

### Déployer une nouvelle version de l'application

Plus de script : un push sur `dev` ou `stg` lance **GitHub Actions** (`.github/workflows/deploy.yml`), qui s'authentifie
sur GCP par **Workload Identity Federation** (aucune clé, aucun token) puis lance **Cloud Build** (`cloudbuild.yaml`).

| Branche | SA emprunté | Déploie |
|---|---|---|
| `dev` | `sa-dev-cloudbuild` | `gcr-…-dev-euw1-front` (et `-back` si `backend/Dockerfile` existe) |
| `stg` | `sa-stg-cloudbuild` | `gcr-…-stg-euw1-front` (et `-back`) |

- Pool d'identités `gh-cvto-accor-pim-enrichment` (géré par dev) : n'accepte que ce repo (ID numérique) et l'événement `push`.
- Chaque branche ne peut emprunter que le SA de build de son env (`principalSet …/attribute.ref/refs/heads/<branche>`).
- SA de build : `cloudbuild.builds.editor`, objets du bucket `bkt-…-<env>-euw1-build-sources` (sources, purgé à 7 jours),
  `artifactregistry.writer` sur l'AR de l'env, `run.developer` sur ses 2 Cloud Run, `serviceAccountUser` sur les SA front/back et sur lui-même,
  `logging.logWriter` / `logging.viewer`.
- Images taguées `<sha court du commit>` et `<env>`. Terraform **ignore l'image** des Cloud Run (`lifecycle.ignore_changes`) :
  un `terraform apply` n'annule jamais un déploiement.
- Un push qui ne modifie que `terraform/**`, de la doc (`*.md`, `docs/**`), `renovate.json` ou `docker-compose.yml` ne redéploie pas.

Guide pas à pas : [docs/ci-cd-cloud-build.html](docs/ci-cd-cloud-build.html).

Backend : pas encore de code, les services tournent avec l'image de démo Google (`back_image_tag = null`).
