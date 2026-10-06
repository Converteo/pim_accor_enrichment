env = "dev"

# dev porte les ressources uniques au projet : bucket de state + rôles du SA Terraform
manage_project_resources = true
# editor ne permet pas de poser de l'IAM au niveau d'une ressource : ces rôles le permettent
terraform_sa_extra_roles = [
  "roles/run.admin",              # IAM des services Cloud Run (invoker, developer)
  "roles/artifactregistry.admin", # IAM des dépôts Docker (writer pour la CI)
  "roles/secretmanager.admin",    # IAM du secret du token GitHub (lecture par Cloud Build)
]

# Chaque push sur cette branche déploie l'environnement (Cloud Build)
deploy_branch = "dev"

front_public  = true
front_scaling = { min = 0, max = 2 }
back_scaling  = { min = 0, max = 2 }
