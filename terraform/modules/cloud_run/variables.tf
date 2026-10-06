variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "name" {
  description = "Nom du service : gcr-cvto-[client]-[solution]-[env]-[region]-[service]."
  type        = string

  # Convention : 63 max ; l'API Cloud Run v2 limite en pratique à 49 caractères.
  validation {
    condition     = can(regex("^gcr-[a-z0-9-]+[a-z0-9]$", var.name)) && length(var.name) <= 49
    error_message = "Nom attendu : gcr-..., minuscules/chiffres/tirets, 49 caractères max (limite Cloud Run v2)."
  }
}

variable "image" {
  description = "Image initiale à la création du service. Ensuite ignorée : c'est la CI qui déploie les nouvelles images."
  type        = string
}

variable "service_account_email" {
  description = "Service account d'exécution du service."
  type        = string
}

variable "container_port" {
  type    = number
  default = 8080
}

variable "cpu" {
  type    = string
  default = "1"
}

variable "memory" {
  type    = string
  default = "512Mi"
}

variable "min_instances" {
  type    = number
  default = 0
}

variable "max_instances" {
  type    = number
  default = 2
}

variable "env" {
  description = "Variables d'environnement (hors PORT, injecté par Cloud Run)."
  type        = map(string)
  default     = {}
}

variable "ingress" {
  type    = string
  default = "INGRESS_TRAFFIC_ALL"
}

variable "health_check_path" {
  type    = string
  default = "/"
}

variable "invoker_members" {
  description = "Membres autorisés à invoquer le service (ex. [\"allUsers\"] pour un accès public)."
  type        = list(string)
  default     = []
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
  description = "Autres bindings IAM sur le service (ex. roles/run.developer pour le SA de build)."
  type = list(object({
    role   = string
    member = string
  }))
  default = []
}
