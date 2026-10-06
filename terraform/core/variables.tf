# ---------- global (vars/global.tfvars) ----------
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

# ---------- environnement (vars/<env>.tfvars) ----------
variable "env" {
  type = string

  validation {
    condition     = contains(["dev", "stg"], var.env)
    error_message = "env doit valoir dev ou stg."
  }
}

variable "manage_project_resources" {
  description = "Gère les ressources uniques au projet (bucket de state, rôles du SA Terraform). true pour UN seul environnement."
  type        = bool
  default     = false
}

variable "terraform_sa_extra_roles" {
  description = "Rôles projet ajoutés au SA Terraform (pris en compte si manage_project_resources = true)."
  type        = set(string)
  default     = []
}

variable "deploy_branch" {
  description = "Branche Git dont chaque push déploie cet environnement."
  type        = string
}

variable "front_public" {
  description = "Frontend accessible sans authentification (allUsers → roles/run.invoker)."
  type        = bool
  default     = false
}

variable "front_scaling" {
  type = object({
    min = number
    max = number
  })
  default = { min = 0, max = 2 }
}

variable "back_scaling" {
  type = object({
    min = number
    max = number
  })
  default = { min = 0, max = 2 }
}

variable "files_noncurrent_retention_days" {
  description = "Rétention des anciennes versions d'objets dans les buckets de fichiers PIM / OTA."
  type        = number
  default     = 30
}
