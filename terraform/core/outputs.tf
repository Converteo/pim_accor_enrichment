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
  description = "Valeurs utilisées par .github/workflows/deploy.yml."
  value = {
    branch                     = var.deploy_branch
    build_service_account      = local.build_sa_email
    source_staging_bucket      = module.bucket_build_sources.name
    workload_identity_provider = "${local.wif_pool_name}/providers/github"
  }
}
