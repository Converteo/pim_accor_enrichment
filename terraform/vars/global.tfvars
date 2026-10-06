# Valeurs communes à tous les environnements (dev et stg partagent le même projet GCP)
project_id                = "cvto-accor-pim-enrichment-dev"
region                    = "europe-west1"
region_short              = "euw1"
client                    = "accor"
solution                  = "pim-enrichment"
terraform_service_account = "sa-dev-terraform@cvto-accor-pim-enrichment-dev.iam.gserviceaccount.com"
tfstate_bucket_name       = "bkt-cvto-accor-pim-enrichment-dev-euw1-tfstate"

labels = {
  client     = "accor"
  solution   = "pim-enrichment"
  owner      = "converteo"
  managed_by = "terraform"
}

apis = [
  "cloudresourcemanager.googleapis.com",
  "serviceusage.googleapis.com",
  "iam.googleapis.com",
  "iamcredentials.googleapis.com",
  "storage.googleapis.com",
  "run.googleapis.com",
  "artifactregistry.googleapis.com",
  "cloudbuild.googleapis.com",
  "sts.googleapis.com", # échange de jetons GitHub → GCP (Workload Identity Federation)
]

# Dépôt GitHub autorisé à déployer (GitHub Actions + Workload Identity Federation)
github_owner         = "Converteo"
github_repo          = "pim_accor_enrichment"
github_repository_id = "1405481297" # api.github.com/repos/Converteo/pim_accor_enrichment → id
