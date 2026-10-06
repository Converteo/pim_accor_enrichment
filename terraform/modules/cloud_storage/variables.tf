variable "project_id" {
  type = string
}

variable "name" {
  description = "Nom du bucket : bkt-cvto-[client]-[solution]-[env]-[region]-[purpose]."
  type        = string

  validation {
    condition     = can(regex("^bkt-[a-z0-9-]+[a-z0-9]$", var.name)) && length(var.name) <= 63
    error_message = "Nom attendu : bkt-..., minuscules/chiffres/tirets (pas d'underscore), 63 caractères max."
  }
}

variable "location" {
  description = "Région ou multi-région (ex. EUROPE-WEST1)."
  type        = string
}

variable "storage_class" {
  type    = string
  default = "STANDARD"
}

variable "versioning" {
  type    = bool
  default = false
}

variable "noncurrent_versions_to_keep" {
  description = "Si renseigné : supprime les versions archivées au-delà de ce nombre."
  type        = number
  default     = null
}

variable "noncurrent_retention_days" {
  description = "Si renseigné : supprime les versions archivées après N jours."
  type        = number
  default     = null
}

variable "delete_after_days" {
  description = "Si renseigné : supprime les objets N jours après leur création."
  type        = number
  default     = null
}

variable "force_destroy" {
  description = "Autorise la suppression d'un bucket non vide. Laisser à false pour les données."
  type        = bool
  default     = false
}

variable "iam_members" {
  description = "Bindings IAM additifs au niveau du bucket."
  type = list(object({
    role   = string
    member = string
  }))
  default = []
}

variable "labels" {
  type    = map(string)
  default = {}
}
