# Crée le "coffre" du secret, sans valeur : la valeur (version) est ajoutée hors Terraform
# pour ne jamais apparaître dans le code ni dans le state.
resource "google_secret_manager_secret" "this" {
  project   = var.project_id
  secret_id = var.secret_id
  labels    = var.labels

  replication {
    user_managed {
      replicas {
        location = var.replica_location
      }
    }
  }
}

resource "google_secret_manager_secret_iam_member" "accessors" {
  for_each = toset(var.accessors)

  project   = google_secret_manager_secret.this.project
  secret_id = google_secret_manager_secret.this.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = each.value
}
