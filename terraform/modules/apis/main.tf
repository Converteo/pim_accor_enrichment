# disable_on_destroy = false : un destroy ne coupe jamais une API (partagée entre environnements).
resource "google_project_service" "this" {
  for_each = var.services

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}
