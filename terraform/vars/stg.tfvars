env = "stg"

manage_project_resources = false

# Chaque push sur cette branche déploie l'environnement (Cloud Build)
deploy_branch = "stg"

front_public  = true
front_scaling = { min = 0, max = 2 }
back_scaling  = { min = 0, max = 2 }
