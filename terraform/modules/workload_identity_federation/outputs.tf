output "pool_name" {
  description = "projects/<numéro>/locations/global/workloadIdentityPools/<pool>"
  value       = google_iam_workload_identity_pool.this.name
}

output "provider_name" {
  description = "Valeur à donner à google-github-actions/auth (workload_identity_provider)."
  value       = google_iam_workload_identity_pool_provider.github.name
}
