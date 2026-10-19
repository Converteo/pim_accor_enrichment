# ---------- commun à tous les environnements (core/terraform.tfvars) ----------
variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "region_short" {
  description = "Code région utilisé dans les noms (europe-west1 → euw1)."
  type        = string
}

variable "client" {
  type = string
}

variable "solution" {
  type = string
}

variable "terraform_service_account" {
  type = string
}

variable "tfstate_bucket_name" {
  description = "Bucket des states Terraform (partagé par tous les environnements du projet)."
  type        = string
}

variable "labels" {
  type    = map(string)
  default = {}
}

variable "apis" {
  type = set(string)
}

variable "github_owner" {
  description = "Organisation GitHub du repo."
  type        = string
}

variable "github_repo" {
  type = string
}

variable "github_repository_id" {
  description = "ID numérique du repo GitHub (seul repo autorisé à déployer via Workload Identity Federation)."
  type        = string
}

variable "files_noncurrent_retention_days" {
  description = "Rétention des anciennes versions d'objets dans les buckets de fichiers PIM / OTA."
  type        = number
  default     = 30
}

# ---------- par environnement : un workspace Terraform = un environnement ----------
variable "environments" {
  description = "Réglages par environnement, indexés par nom de workspace (terraform workspace select dev|stg)."
  type = map(object({
    # Branche Git dont chaque push déploie cet environnement (Cloud Build)
    deploy_branch = string
    # Gère les ressources uniques au projet (bucket de state, rôles du SA Terraform, pool WIF). true pour UN seul environnement.
    manage_project_resources = optional(bool, false)
    # Rôles projet ajoutés au SA Terraform (pris en compte si manage_project_resources = true)
    terraform_sa_extra_roles = optional(set(string), [])
    # Frontend accessible sans authentification (allUsers → roles/run.invoker)
    front_public  = optional(bool, false)
    front_scaling = optional(object({ min = number, max = number }), { min = 0, max = 2 })
    back_scaling  = optional(object({ min = number, max = number }), { min = 0, max = 2 })

    # Pipeline d'enrichissement (pipeline/), réglages posés en variables d'environnement des jobs
    pipeline = optional(object({
      gemini_model         = optional(string, "gemini-3.8-flash")
      thinking_level       = optional(string, "LOW")
      vertex_location      = optional(string, "eu")
      llm_concurrency      = optional(number, 6)
      judge_threshold_high = optional(number, 80) # score de l'agent juge à partir duquel un rapprochement est validé automatiquement
      judge_threshold_low  = optional(number, 30) # en dessous : rejeté ; entre les deux : à valider dans l'interface
      # null = pas de validation automatique des enrichissements : tout passe par l'interface
      enrich_auto_validate_score = optional(number)
      scope_status               = optional(string, "Open,Pre-opening") # statuts d'hôtel du PIM traités
      scheduler_paused           = optional(bool, true)
    }), {})
  }))

  validation {
    condition     = alltrue([for name in keys(var.environments) : contains(["dev", "stg"], name)])
    error_message = "Environnements attendus : dev, stg."
  }

  validation {
    condition     = length([for e in values(var.environments) : e if e.manage_project_resources]) == 1
    error_message = "Un seul environnement doit avoir manage_project_resources = true."
  }
}
