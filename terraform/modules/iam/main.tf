resource "google_service_account" "this" {
  for_each = var.service_accounts

  project      = var.project_id
  account_id   = each.value.account_id
  display_name = each.value.display_name
  description  = each.value.description
}

# Bindings additifs (google_project_iam_member) : n'écrasent jamais la policy du projet.
resource "google_project_iam_member" "this" {
  for_each = { for b in var.project_roles : "${b.role}|${b.member}" => b }

  project = var.project_id
  role    = each.value.role
  member  = each.value.member

  # un membre peut être un SA créé ici même
  depends_on = [google_service_account.this]
}

# Droits portant sur un SA créé par ce module (ex. "le SA de build peut agir en tant que le SA front")
resource "google_service_account_iam_member" "this" {
  for_each = { for b in var.service_account_iam_members : "${b.sa_key}|${b.role}|${b.member}" => b }

  service_account_id = google_service_account.this[each.value.sa_key].name
  role               = each.value.role
  member             = each.value.member

  depends_on = [google_service_account.this]
}
