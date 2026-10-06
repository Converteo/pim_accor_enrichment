variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

# ---------- Connexion GitHub (une seule par projet) ----------
variable "create_connection" {
  description = "Crée la connexion GitHub et le lien vers le repo (true pour UN seul environnement)."
  type        = bool
  default     = false
}

variable "connection_name" {
  type = string
}

variable "github_app_installation_id" {
  description = "ID d'installation de l'app GitHub « Google Cloud Build » sur l'organisation."
  type        = number
  default     = null
}

variable "github_token_secret_version" {
  description = "Version Secret Manager du token GitHub (projects/../secrets/../versions/N|latest)."
  type        = string
  default     = null
}

variable "repository_name" {
  description = "Nom du repo dans Cloud Build (ex. pim_accor_enrichment)."
  type        = string
}

variable "repository_remote_uri" {
  description = "URL https du repo GitHub (.git)."
  type        = string
}

# ---------- Trigger de déploiement ----------
variable "trigger_name" {
  type = string
}

variable "trigger_description" {
  type    = string
  default = null
}

variable "branch" {
  description = "Branche qui déclenche le build (nom exact)."
  type        = string
}

variable "build_config_filename" {
  type    = string
  default = "cloudbuild.yaml"
}

variable "service_account_email" {
  description = "SA avec lequel le build s'exécute."
  type        = string
}

variable "substitutions" {
  description = "Variables passées au cloudbuild.yaml (clés commençant par _)."
  type        = map(string)
  default     = {}
}

variable "ignored_files" {
  description = "Un push qui ne modifie QUE ces fichiers ne déclenche pas de build."
  type        = list(string)
  default     = []
}
