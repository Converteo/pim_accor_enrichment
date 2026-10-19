# Job Cloud Run (une exécution = un traitement par lot, lancé par le workflow).
resource "google_cloud_run_v2_job" "this" {
  name                = var.name
  project             = var.project_id
  location            = var.region
  deletion_protection = var.deletion_protection
  labels              = var.labels

  template {
    labels = var.labels

    template {
      service_account = var.service_account_email
      timeout         = var.timeout
      max_retries     = var.max_retries

      containers {
        image = var.image
        args  = var.args

        resources {
          limits = {
            cpu    = var.cpu
            memory = var.memory
          }
        }

        dynamic "env" {
          for_each = var.env
          content {
            name  = env.key
            value = env.value
          }
        }
      }
    }
  }

  # Comme pour les services : l'image est déployée par la CI (Cloud Build), Terraform ne la touche plus.
  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }
}

resource "google_cloud_run_v2_job_iam_member" "this" {
  for_each = { for b in var.iam_members : "${b.role}|${b.member}" => b }

  project  = google_cloud_run_v2_job.this.project
  location = google_cloud_run_v2_job.this.location
  name     = google_cloud_run_v2_job.this.name
  role     = each.value.role
  member   = each.value.member
}
