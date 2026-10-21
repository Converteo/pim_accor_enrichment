# Valeurs communes à tous les environnements (dev et stg partagent le même projet GCP). Chargé automatiquement par Terraform.
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
  # pipeline d'enrichissement (terraform/core/pipeline.tf)
  "bigquery.googleapis.com",
  "firestore.googleapis.com",
  "secretmanager.googleapis.com",
  "aiplatform.googleapis.com", # Gemini (agents juge et d'enrichissement)
  "workflows.googleapis.com",
  "workflowexecutions.googleapis.com",
  "eventarc.googleapis.com",
  "pubsub.googleapis.com", # transport des événements Cloud Storage → Eventarc
  "cloudscheduler.googleapis.com",
]

# Dépôt GitHub autorisé à déployer (GitHub Actions + Workload Identity Federation)
github_owner         = "Converteo"
github_repo          = "pim_accor_enrichment"
github_repository_id = "1405481297" # api.github.com/repos/Converteo/pim_accor_enrichment → id

# Réglages par environnement : la clé est le nom du workspace (terraform workspace select dev|stg)
environments = {
  dev = {
    deploy_branch = "dev" # chaque push sur cette branche déploie l'environnement (Cloud Build)

    # dev porte les ressources uniques au projet : bucket de state, rôles du SA Terraform, pool WIF
    manage_project_resources = true
    # editor ne permet pas de poser de l'IAM au niveau d'une ressource : ces rôles le permettent
    terraform_sa_extra_roles = [
      "roles/run.admin",                     # IAM des services Cloud Run (invoker, developer)
      "roles/artifactregistry.admin",        # IAM des dépôts Docker (writer pour la CI)
      "roles/iam.workloadIdentityPoolAdmin", # pool d'identités GitHub Actions (WIF)
      "roles/bigquery.admin",                # IAM des datasets du pipeline
      "roles/secretmanager.admin",           # IAM du secret de la clé API du PIM
      "roles/datastore.owner",               # création de la base Firestore du pipeline (editor ne suffit pas)
    ]

    front_public  = true
    front_scaling = { min = 0, max = 2 }
    back_scaling  = { min = 0, max = 2 }

    # Planificateur repris : les rapprochements validés dans l'interface sont enrichis sans relance manuelle (coûts LLM à surveiller)
    pipeline = { scheduler_paused = false }
  }

  stg = {
    deploy_branch = "stg"

    front_public  = true
    front_scaling = { min = 0, max = 2 }
    back_scaling  = { min = 0, max = 2 }
  }
}
