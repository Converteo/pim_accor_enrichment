variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "name" {
  description = "Nom du job : gcrj-cvto-[client]-[solution]-[env]-[region]-[job]."
  type        = string

  validation {
    condition     = can(regex("^gcrj-[a-z0-9-]+[a-z0-9]$", var.name)) && length(var.name) <= 63
    error_message = "Nom attendu : gcrj-..., minuscules/chiffres/tirets, 63 caractères max."
  }
}

variable "image" {
  description = "Image initiale à la création du job. Ensuite ignorée : c'est la CI qui déploie les nouvelles images."
  type        = string
}

variable "args" {
  description = "Arguments du conteneur (ex. [\"matching.py\"])."
  type        = list(string)
  default     = []
}

variable "service_account_email" {
  type = string
}

variable "timeout" {
  description = "Durée maximale d'une tâche (ex. \"3600s\")."
  type        = string
  default     = "3600s"
}

variable "max_retries" {
  type    = number
  default = 0
}

variable "cpu" {
  type    = string
  default = "1"
}

variable "memory" {
  type    = string
  default = "512Mi"
}

variable "env" {
  type    = map(string)
  default = {}
}

variable "deletion_protection" {
  type    = bool
  default = false
}

variable "labels" {
  type    = map(string)
  default = {}
}

variable "iam_members" {
  description = "Bindings IAM sur le job (ex. roles/run.developer pour le SA de build, roles/run.invoker pour le backend)."
  type = list(object({
    role   = string
    member = string
  }))
  default = []
}
