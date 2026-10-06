output "id" {
  description = "projects/<n>/secrets/<id>"
  value       = google_secret_manager_secret.this.id
}

output "secret_id" {
  value = google_secret_manager_secret.this.secret_id
}
