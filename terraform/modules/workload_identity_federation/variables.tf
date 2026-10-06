variable "project_id" {
  type = string
}

variable "pool_id" {
  description = "ID du pool (4 à 32 caractères : minuscules, chiffres, tirets)."
  type        = string
}

variable "provider_id" {
  type    = string
  default = "github"
}

variable "github_repository_id" {
  description = "ID numérique du repo GitHub autorisé (stable même si le repo est renommé)."
  type        = string
}

variable "github_repository" {
  description = "owner/repo, pour la lisibilité et en second contrôle."
  type        = string
}
