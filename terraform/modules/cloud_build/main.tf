# ---------- Connexion GitHub → Cloud Build (2nd gen) ----------
resource "google_cloudbuildv2_connection" "github" {
  count = var.create_connection ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = var.connection_name

  github_config {
    app_installation_id = var.github_app_installation_id
    authorizer_credential {
      oauth_token_secret_version = var.github_token_secret_version
    }
  }
}

resource "google_cloudbuildv2_repository" "this" {
  count = var.create_connection ? 1 : 0

  project           = var.project_id
  location          = var.region
  name              = var.repository_name
  parent_connection = google_cloudbuildv2_connection.github[0].name
  remote_uri        = var.repository_remote_uri
}

locals {
  # Les environnements qui ne créent pas la connexion référencent le repo par son nom complet
  repository_id = "projects/${var.project_id}/locations/${var.region}/connections/${var.connection_name}/repositories/${var.repository_name}"
}

# ---------- Trigger : push sur la branche → cloudbuild.yaml ----------
resource "google_cloudbuild_trigger" "deploy" {
  project     = var.project_id
  location    = var.region
  name        = var.trigger_name
  description = var.trigger_description

  repository_event_config {
    repository = local.repository_id
    push {
      branch = "^${var.branch}$"
    }
  }

  filename        = var.build_config_filename
  service_account = "projects/${var.project_id}/serviceAccounts/${var.service_account_email}"
  substitutions   = var.substitutions
  ignored_files   = var.ignored_files

  depends_on = [google_cloudbuildv2_repository.this]
}
