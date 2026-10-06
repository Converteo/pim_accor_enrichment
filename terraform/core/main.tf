locals {
  # [client]-[solution]-[env]-[region] → accor-pim-enrichment-dev-euw1
  base = "cvto-${var.client}-${var.solution}-${var.env}-${var.region_short}"

  labels = merge(var.labels, { env = var.env })

  # Image de démarrage d'un service neuf. Ensuite, c'est Cloud Build qui déploie les vraies images
  # (le module cloud_run ignore les changements d'image).
  placeholder_image = "us-docker.pkg.dev/cloudrun/container/hello"

  build_sa_email  = "sa-${var.env}-cloudbuild@${var.project_id}.iam.gserviceaccount.com"
  build_sa_member = "serviceAccount:${local.build_sa_email}"

  # Workload Identity Federation (GitHub Actions → GCP), unique au projet
  wif_pool_id   = "gh-cvto-${var.client}-${var.solution}" # 32 caractères max
  wif_pool_name = "projects/${data.google_project.this.number}/locations/global/workloadIdentityPools/${local.wif_pool_id}"

  # Identité GitHub autorisée à agir en tant que le SA de build de cet env : un push sur SA branche
  github_branch_principal = "principalSet://iam.googleapis.com/${local.wif_pool_name}/attribute.ref/refs/heads/${var.deploy_branch}"
}

data "google_project" "this" {
  project_id = var.project_id
}

# ---------- APIs (idempotent, partagées entre envs) ----------
module "apis" {
  source = "../modules/apis"

  project_id = var.project_id
  services   = var.apis
}

# ---------- Bucket de state Terraform (unique au projet) ----------
module "tfstate_bucket" {
  source = "../modules/cloud_storage"
  count  = var.manage_project_resources ? 1 : 0

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
      account_id   = "sa-${var.env}-frontend"
      display_name = "Cloud Run frontend (${var.env})"
      description  = "Identité d'exécution du Cloud Run frontend."
    }
    back = {
      account_id   = "sa-${var.env}-backend"
      display_name = "Cloud Run backend (${var.env})"
      description  = "Identité d'exécution du Cloud Run backend (lecture/écriture des buckets PIM et OTA)."
    }
    build = {
      account_id   = "sa-${var.env}-cloudbuild"
      display_name = "Cloud Build deploy (${var.env})"
      description  = "Exécute la CI de la branche ${var.deploy_branch} : build, push Artifact Registry, déploiement Cloud Run."
    }
  }

  project_roles = concat(
    var.manage_project_resources ? [
      for r in var.terraform_sa_extra_roles : {
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
  description   = "Images Docker PIM Accor enrichment (${var.env})"

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

  iam_members = [
    { role = "roles/storage.objectAdmin", member = module.iam.members["back"] },
  ]

  depends_on = [module.apis]
}

module "bucket_ota_files" {
  source = "../modules/cloud_storage"

  project_id                = var.project_id
  name                      = "bkt-${local.base}-ota-files" # Expedia + Booking
  location                  = var.region
  versioning                = true
  noncurrent_retention_days = var.files_noncurrent_retention_days

  iam_members = [
    { role = "roles/storage.objectAdmin", member = module.iam.members["back"] },
  ]

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
  min_instances         = var.back_scaling.min
  max_instances         = var.back_scaling.max
  labels                = { component = "back" }

  # Seul le frontend peut appeler le backend
  invoker_members = [module.iam.members["front"]]

  # La CI peut déployer de nouvelles révisions
  iam_members = [
    { role = "roles/run.developer", member = local.build_sa_member },
  ]

  env = {
    PIM_FILES_BUCKET = module.bucket_pim_files.name
    OTA_FILES_BUCKET = module.bucket_ota_files.name
  }

  depends_on = [module.apis]
}

# ---------- Cloud Run frontend ----------
module "cloud_run_front" {
  source = "../modules/cloud_run"

  project_id            = var.project_id
  region                = var.region
  name                  = "gcr-${local.base}-front"
  image                 = local.placeholder_image
  service_account_email = module.iam.emails["front"]
  min_instances         = var.front_scaling.min
  max_instances         = var.front_scaling.max
  labels                = { component = "front" }

  invoker_members = var.front_public ? ["allUsers"] : []

  iam_members = [
    { role = "roles/run.developer", member = local.build_sa_member },
  ]

  env = {
    NEXT_TELEMETRY_DISABLED = "1"
    BACKEND_URL             = module.cloud_run_back.uri
  }

  depends_on = [module.apis]
}

# ---------- CI/CD : GitHub Actions → Cloud Build ----------
# Pool d'identités GitHub (unique au projet → géré par dev)
module "wif" {
  source = "../modules/workload_identity_federation"
  count  = var.manage_project_resources ? 1 : 0

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
