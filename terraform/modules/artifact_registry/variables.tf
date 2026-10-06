variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "repository_id" {
  type = string
}

variable "description" {
  type    = string
  default = null
}

variable "keep_count" {
  description = "Nombre de versions récentes conservées par image."
  type        = number
  default     = 10
}

variable "untagged_retention" {
  description = "Durée avant suppression des images non taguées."
  type        = string
  default     = "604800s" # 7 jours
}

variable "labels" {
  type    = map(string)
  default = {}
}

variable "iam_members" {
  description = "Bindings IAM sur le dépôt (ex. roles/artifactregistry.writer pour le SA de build)."
  type = list(object({
    role   = string
    member = string
  }))
  default = []
}
