output "trigger_id" {
  value = google_cloudbuild_trigger.deploy.trigger_id
}

output "trigger_name" {
  value = google_cloudbuild_trigger.deploy.name
}

output "repository_id" {
  value = local.repository_id
}
