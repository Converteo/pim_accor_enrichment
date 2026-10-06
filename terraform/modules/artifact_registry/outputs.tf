output "id" {
  value = google_artifact_registry_repository.this.id
}

output "repository_id" {
  value = google_artifact_registry_repository.this.repository_id
}

output "path" {
  description = "Préfixe des images : <region>-docker.pkg.dev/<projet>/<repo>."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.this.repository_id}"
}
