# Workload Identity Federation : GitHub Actions s'authentifie auprès de GCP sans clé ni token.
# GitHub fournit un jeton OIDC signé ("je suis le repo X, branche Y") que GCP échange
# contre un accès temporaire à un service account.

resource "google_iam_workload_identity_pool" "this" {
  project                   = var.project_id
  workload_identity_pool_id = var.pool_id
  display_name              = "GitHub Actions"
  description               = "Identités GitHub Actions du repo ${var.github_repository}"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.this.workload_identity_pool_id
  workload_identity_pool_provider_id = var.provider_id
  display_name                       = "GitHub OIDC"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  # Champs du jeton GitHub réutilisables dans les droits IAM (ex. attribute.ref = refs/heads/dev)
  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository"    = "assertion.repository"
    "attribute.repository_id" = "assertion.repository_id"
    "attribute.ref"           = "assertion.ref"
    "attribute.event_name"    = "assertion.event_name"
  }

  # Seul CE repo peut obtenir un accès, et seulement sur un push (pas de PR, ni de fork)
  attribute_condition = <<-EOT
    assertion.repository_id == "${var.github_repository_id}" &&
    assertion.repository == "${var.github_repository}" &&
    assertion.event_name == "push"
  EOT
}
