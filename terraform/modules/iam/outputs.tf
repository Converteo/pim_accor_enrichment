output "emails" {
  description = "Emails des service accounts créés, par clé logique."
  value       = { for k, sa in google_service_account.this : k => sa.email }
}

output "members" {
  description = "Identités IAM (serviceAccount:...) par clé logique."
  value       = { for k, sa in google_service_account.this : k => sa.member }
}
