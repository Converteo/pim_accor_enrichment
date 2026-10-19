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

output "pipeline" {
  description = "Ressources du pipeline d'enrichissement (pipeline/README.md)."
  value = {
    deposit_bucket = "gs://${module.bucket_ota_files.name}/<source>/"
    prompts_bucket = module.bucket_prompts.name
    exports_bucket = module.bucket_exports.name
    datasets       = { for k, d in google_bigquery_dataset.pipeline : k => d.dataset_id }
    jobs           = { for k, j in module.pipeline_jobs : k => j.name }
    load_bq        = module.cloud_run_load_bq.name
    workflow       = google_workflows_workflow.enrichment.name
    scheduler      = google_cloud_scheduler_job.enrichment.name
    pim_api_secret = google_secret_manager_secret.pim_api_key.secret_id
  }
}
