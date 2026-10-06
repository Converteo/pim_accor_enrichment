locals {
  # [client]-[solution]-[env]-[region] → accor-pim-enrichment-dev-euw1
  base = "cvto-${var.client}-${var.solution}-${var.env}-${var.region_short}"

  labels = merge(var.labels, { env = var.env })

  # Image de démarrage d'un service neuf. Ensuite, c'est Cloud Build qui déploie les vraies images
  # (le module cloud_run ignore les changements d'image).
  placeholder_image = "us-docker.pkg.dev/cloudrun/container/hello"

  build_sa_email  = "sa-${var.env}-cloudbuild@${var.project_id}.iam.gserviceaccount.com"
  build_sa_member = "serviceAccount:${local.build_sa_email}"

  ci_enabled = var.github_app_installation_id != null

  # Ressources Cloud Build propres au projet (une seule connexion GitHub, partagée par dev et stg)
  project_slug    = "cvto-${var.client}-${var.solution}"
  connection_name = "gcb-${local.project_slug}-${var.region_short}-github"
  github_secret   = "sec-${local.project_slug}-github-token"
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
    # écrire les logs de build
    [{ role = "roles/logging.logWriter", member = local.build_sa_member }],
  )

  # Le SA de build déploie les Cloud Run "en tant que" leurs SA d'exécution
  service_account_iam_members = [
    { sa_key = "front", role = "roles/iam.serviceAccountUser", member = local.build_sa_member },
    { sa_key = "back", role = "roles/iam.serviceAccountUser", member = local.build_sa_member },
  ]

  depends_on = [module.apis]
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

# ---------- CI/CD : Cloud Build ----------
# Token GitHub (coffre seulement ; la valeur est ajoutée hors Terraform). Unique au projet → géré par dev.
module "github_token_secret" {
  source = "../modules/secrets"
  count  = var.manage_project_resources ? 1 : 0

  project_id       = var.project_id
  secret_id        = local.github_secret
  replica_location = var.region

  # L'agent de service Cloud Build lit le token pour parler à GitHub
  accessors = ["serviceAccount:service-${data.google_project.this.number}@gcp-sa-cloudbuild.iam.gserviceaccount.com"]

  depends_on = [module.apis]
}

module "cloud_build" {
  source = "../modules/cloud_build"
  count  = local.ci_enabled ? 1 : 0

  project_id = var.project_id
  region     = var.region

  # Connexion GitHub + repo : créés une seule fois (par dev)
  create_connection           = var.manage_project_resources
  connection_name             = local.connection_name
  github_app_installation_id  = var.github_app_installation_id
  github_token_secret_version = var.manage_project_resources ? "${module.github_token_secret[0].id}/versions/latest" : null
  repository_name             = var.github_repo
  repository_remote_uri       = "https://github.com/${var.github_owner}/${var.github_repo}.git"

  # Trigger : push sur la branche de l'env → cloudbuild.yaml
  trigger_name          = "gcb-${local.base}-deploy"
  trigger_description   = "Push sur ${var.deploy_branch} : build + déploiement front/back ${var.env}"
  branch                = var.deploy_branch
  service_account_email = local.build_sa_email

  substitutions = {
    _ENV           = var.env
    _REGION        = var.region
    _AR_PATH       = module.artifact_registry.path
    _FRONT_SERVICE = module.cloud_run_front.name
    _BACK_SERVICE  = module.cloud_run_back.name
  }

  # Un push qui ne touche que l'infra ou la doc ne redéploie pas l'application
  ignored_files = [
    "terraform/**",
    "**/*.md",
    "**/docs/**",
    "renovate.json",
    "docker-compose.yml",
  ]

  depends_on = [module.apis, module.iam, module.github_token_secret]
}
