locals {
  # Un workspace Terraform = un environnement (terraform workspace select dev|stg).
  # Le workspace "default" n'est pas un environnement : var.environments["default"] échoue, rien n'est planifié.
  env = terraform.workspace
  cfg = var.environments[terraform.workspace]

  # [client]-[solution]-[env]-[region] → accor-pim-enrichment-dev-euw1
  base = "cvto-${var.client}-${var.solution}-${local.env}-${var.region_short}"

  labels = merge(var.labels, { env = local.env })

  # Image de démarrage d'un service neuf. Ensuite, c'est Cloud Build qui déploie les vraies images
  # (le module cloud_run ignore les changements d'image).
  placeholder_image = "us-docker.pkg.dev/cloudrun/container/hello"

  build_sa_email  = "sa-${local.env}-cloudbuild@${var.project_id}.iam.gserviceaccount.com"
  build_sa_member = "serviceAccount:${local.build_sa_email}"

  # Workload Identity Federation (GitHub Actions → GCP), unique au projet
  wif_pool_id   = "gh-cvto-${var.client}-${var.solution}" # 32 caractères max
  wif_pool_name = "projects/${data.google_project.this.number}/locations/global/workloadIdentityPools/${local.wif_pool_id}"

  # Identité GitHub autorisée à agir en tant que le SA de build de cet env : un push sur SA branche
  github_branch_principal = "principalSet://iam.googleapis.com/${local.wif_pool_name}/attribute.ref/refs/heads/${local.cfg.deploy_branch}"

  front_name = "gcr-${local.base}-front"
  # Agent de service IAP : c'est lui qui appelle le front une fois l'utilisateur authentifié
  iap_agent_member = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-iap.iam.gserviceaccount.com"
}

data "google_project" "this" {
  project_id = var.project_id
}

# ---------- APIs (idempotent, partagées entre envs) ----------
module "apis" {
  source = "../modules/apis"

  project_id = var.project_id
  services   = local.cfg.front_iap ? setunion(var.apis, ["iap.googleapis.com"]) : var.apis
}

# ---------- Bucket de state Terraform (unique au projet) ----------
module "tfstate_bucket" {
  source = "../modules/cloud_storage"
  count  = local.cfg.manage_project_resources ? 1 : 0

  project_id                  = var.project_id
  name                        = var.tfstate_bucket_name
  location                    = var.region
  versioning                  = true
  noncurrent_versions_to_keep = 20
  force_destroy               = false # ne peut pas être supprimé tant qu'il contient des states

  depends_on = [module.apis]
}

# ---------- Identités ----------
module "iam" {
  source = "../modules/iam"

  project_id = var.project_id

  service_accounts = {
    front = {
      account_id   = "sa-${local.env}-frontend"
      display_name = "Cloud Run frontend (${local.env})"
      description  = "Identité d'exécution du Cloud Run frontend."
    }
    back = {
      account_id   = "sa-${local.env}-backend"
      display_name = "Cloud Run backend (${local.env})"
      description  = "Identité d'exécution du Cloud Run backend (lecture des vues, écriture des décisions, lancement de l'export)."
    }
    build = {
      account_id   = "sa-${local.env}-cloudbuild"
      display_name = "Cloud Build deploy (${local.env})"
      description  = "Exécute la CI de la branche ${local.cfg.deploy_branch} : build, push Artifact Registry, déploiement Cloud Run."
    }
  }

  project_roles = concat(
    local.cfg.manage_project_resources ? [
      for r in local.cfg.terraform_sa_extra_roles : {
        role   = r
        member = "serviceAccount:${var.terraform_service_account}"
      }
    ] : [],
    [
      { role = "roles/cloudbuild.builds.editor", member = local.build_sa_member }, # lancer un build (gcloud builds submit)
      { role = "roles/logging.logWriter", member = local.build_sa_member },        # écrire les logs du build
      { role = "roles/logging.viewer", member = local.build_sa_member },           # les relire depuis GitHub Actions
    ],
  )

  service_account_iam_members = [
    # Le SA de build déploie les Cloud Run "en tant que" leurs SA d'exécution
    { sa_key = "front", role = "roles/iam.serviceAccountUser", member = local.build_sa_member },
    { sa_key = "back", role = "roles/iam.serviceAccountUser", member = local.build_sa_member },
    # ... et lance ses builds en tant que lui-même
    { sa_key = "build", role = "roles/iam.serviceAccountUser", member = local.build_sa_member },
    # GitHub Actions (push sur la branche de l'env uniquement) peut se faire passer pour le SA de build
    { sa_key = "build", role = "roles/iam.workloadIdentityUser", member = local.github_branch_principal },
  ]

  depends_on = [module.apis, module.wif]
}

# ---------- Artifact Registry (un dépôt par env) ----------
module "artifact_registry" {
  source = "../modules/artifact_registry"

  project_id    = var.project_id
  region        = var.region
  repository_id = "ar-${local.base}-docker"
  description   = "Images Docker PIM Accor enrichment (${local.env})"

  # La CI pousse les images de cet environnement
  iam_members = [
    { role = "roles/artifactregistry.writer", member = local.build_sa_member },
  ]

  depends_on = [module.apis]
}

# ---------- Buckets de fichiers entrants ----------
module "bucket_pim_files" {
  source = "../modules/cloud_storage"

  project_id                = var.project_id
  name                      = "bkt-${local.base}-pim-files"
  location                  = var.region
  versioning                = true
  noncurrent_retention_days = var.files_noncurrent_retention_days

  depends_on = [module.apis]
}

module "bucket_ota_files" {
  source = "../modules/cloud_storage"

  project_id                = var.project_id
  name                      = "bkt-${local.base}-ota-files" # Expedia + Booking
  location                  = var.region
  versioning                = true
  noncurrent_retention_days = var.files_noncurrent_retention_days

  depends_on = [module.apis]
}

# ---------- Cloud Run backend (privé) ----------
module "cloud_run_back" {
  source = "../modules/cloud_run"

  project_id            = var.project_id
  region                = var.region
  name                  = "gcr-${local.base}-back"
  image                 = local.placeholder_image
  service_account_email = module.iam.emails["back"]
  health_check_path     = "/healthz" # sondes de démarrage et de vie (le back ne répond pas sur /)
  min_instances         = local.cfg.back_scaling.min
  max_instances         = local.cfg.back_scaling.max
  labels                = { component = "back" }

  # Seul le frontend peut appeler le backend
  invoker_members = [module.iam.members["front"]]

  # La CI peut déployer de nouvelles révisions
  iam_members = [
    { role = "roles/run.developer", member = local.build_sa_member },
  ]

  # Lues par NestJS (noms fixés avec le back, voir pipeline/docs/contrat-back.md)
  env = {
    GCP_PROJECT_ID        = var.project_id
    REGION                = var.region
    BQ_MATCHING_DATASET   = google_bigquery_dataset.pipeline["matching"].dataset_id
    BQ_ENHANCED_DATASET   = google_bigquery_dataset.pipeline["enhanced"].dataset_id
    BQ_VALIDATION_DATASET = google_bigquery_dataset.pipeline["validation"].dataset_id
    EXPORT_JOB            = module.pipeline_jobs["export"].name
    EXPORTS_BUCKET        = module.bucket_exports.name
  }

  depends_on = [module.apis]
}

# ---------- Cloud Run frontend ----------
module "cloud_run_front" {
  source = "../modules/cloud_run"

  project_id            = var.project_id
  region                = var.region
  name                  = local.front_name
  image                 = local.placeholder_image
  service_account_email = module.iam.emails["front"]
  min_instances         = local.cfg.front_scaling.min
  max_instances         = local.cfg.front_scaling.max
  labels                = { component = "front" }

  iap_enabled     = local.cfg.front_iap
  invoker_members = local.cfg.front_public ? ["allUsers"] : local.cfg.front_iap ? [local.iap_agent_member] : []

  iam_members = [
    { role = "roles/run.developer", member = local.build_sa_member },
  ]

  env = {
    NEXT_TELEMETRY_DISABLED = "1"
    BACKEND_URL             = module.cloud_run_back.uri
    # Audience du jeton IAP (x-goog-iap-jwt-assertion) vérifié par le front ; vide sans IAP
    IAP_AUDIENCE = local.cfg.front_iap ? "/projects/${data.google_project.this.number}/locations/${var.region}/services/${local.front_name}" : ""
  }

  depends_on = [module.apis]
}

# Accès au front via IAP : comptes Converteo uniquement
resource "google_iap_web_cloud_run_service_iam_member" "front_converteo" {
  count = local.cfg.front_iap ? 1 : 0

  project                = var.project_id
  location               = var.region
  cloud_run_service_name = module.cloud_run_front.name
  role                   = "roles/iap.httpsResourceAccessor"
  member                 = "domain:converteo.com"
}

# ---------- CI/CD : GitHub Actions → Cloud Build ----------
# Pool d'identités GitHub (unique au projet → géré par dev)
module "wif" {
  source = "../modules/workload_identity_federation"
  count  = local.cfg.manage_project_resources ? 1 : 0

  project_id           = var.project_id
  pool_id              = local.wif_pool_id
  github_repository_id = var.github_repository_id
  github_repository    = "${var.github_owner}/${var.github_repo}"

  depends_on = [module.apis]
}

# Bucket où `gcloud builds submit` dépose le code à construire (purgé après 7 jours)
module "bucket_build_sources" {
  source = "../modules/cloud_storage"

  project_id        = var.project_id
  name              = "bkt-${local.base}-build-sources"
  location          = var.region
  delete_after_days = 7

  iam_members = [
    { role = "roles/storage.objectAdmin", member = local.build_sa_member },
    { role = "roles/storage.legacyBucketReader", member = local.build_sa_member }, # gcloud vérifie l'existence du bucket
  ]

  depends_on = [module.apis]
}
