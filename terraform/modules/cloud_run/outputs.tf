output "name" {
  value = google_cloud_run_v2_service.this.name
}

output "uri" {
  description = "URL publique *.run.app du service."
  value       = google_cloud_run_v2_service.this.uri
}

output "latest_revision" {
  value = google_cloud_run_v2_service.this.latest_ready_revision
}
