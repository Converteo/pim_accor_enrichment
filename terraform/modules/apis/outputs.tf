output "services" {
  description = "APIs activées."
  value       = [for s in google_project_service.this : s.service]
}
