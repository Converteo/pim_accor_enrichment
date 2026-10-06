output "env" {
  value = var.env
}

output "front_url" {
  value = module.cloud_run_front.uri
}

output "back_url" {
  description = "URL du backend (privé : appel authentifié par le SA frontend uniquement)."
  value       = module.cloud_run_back.uri
}

output "artifact_registry_path" {
  value = module.artifact_registry.path
}

output "buckets" {
  value = {
    pim_files = module.bucket_pim_files.name
    ota_files = module.bucket_ota_files.name
    tfstate   = var.tfstate_bucket_name
  }
}

output "service_accounts" {
  value = module.iam.emails
}

output "ci" {
  description = "CI Cloud Build de l'environnement (null tant que github_app_installation_id n'est pas renseigné)."
  value = local.ci_enabled ? {
    branch    = var.deploy_branch
    trigger   = module.cloud_build[0].trigger_name
    build_sa  = local.build_sa_email
    repo_link = module.cloud_build[0].repository_id
  } : null
}
