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
  "secretmanager.googleapis.com",
]

# Dépôt GitHub (CI Cloud Build)
github_owner = "Converteo"
github_repo  = "pim_accor_enrichment"
# ID d'installation de l'app GitHub « Google Cloud Build » sur l'org Converteo.
# null = CI pas encore activée.
github_app_installation_id = null
