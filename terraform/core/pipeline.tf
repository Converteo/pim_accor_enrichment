# Pipeline d'enrichissement (code : pipeline/, voir pipeline/README.md)
#
#   dépôt CSV dans le bucket OTA (<source>/<fichier>.csv)
#     → Eventarc → Cloud Run load-bq → BigQuery raw.<source> → workflow
#   workflow : job extract-pim → job matching → job judge → job enrich (une exécution par famille)
#   backend : lit les vues, écrit les décisions humaines (dataset validation), lance le job export
#
# Terraform crée les ressources et leur configuration (variables d'environnement, droits). Les images, le code du
# workflow et les prompts sont déployés par la CI (cloudbuild.yaml), comme le front et le back.

locals {
  # BigQuery n'accepte pas les tirets : cvto_accor_pim_enrichment_dev_euw1_<dataset>
  bq_base      = replace(local.base, "-", "_")
  pipeline_src = "${path.module}/../../pipeline/jobs/src"

  datasets = {
    raw        = "Extraction du PIM et dépôts de scraping, tels que chargés"
    matching   = "Rapprochements des scrapings avec le PIM, et jugements de l'agent juge"
    validation = "Décisions humaines prises dans l'interface (ajout seul, la dernière l'emporte)"
    enhanced   = "Valeurs proposées par l'agent d'enrichissement, et exports"
  }

  # Tables écrites par les jobs et le backend ; schémas partagés avec le code (pipeline/jobs/src/schemas)
  tables = {
    pim_model            = { dataset = "raw", partition = null, cluster = ["entity_type"] }
    pim_cvl_values       = { dataset = "raw", partition = null, cluster = ["cvl_id"] }
    match_candidates     = { dataset = "matching", partition = null, cluster = ["source", "pre_verdict"] }
    unknown_rids         = { dataset = "matching", partition = null, cluster = ["source"] }
    match_judgments      = { dataset = "matching", partition = "judged_at", cluster = ["rid", "status"] }
    match_decisions      = { dataset = "validation", partition = "decided_at", cluster = ["rid", "source"] }
    enrichments          = { dataset = "enhanced", partition = "enriched_at", cluster = ["family", "rid", "status"] }
    enrichment_targets   = { dataset = "enhanced", partition = "computed_at", cluster = ["family", "rid"] }
    enrichment_decisions = { dataset = "validation", partition = "decided_at", cluster = ["rid", "pim_field"] }
    exports              = { dataset = "enhanced", partition = "exported_at", cluster = [] }
  }

  # Vues, dans l'ordre de leurs dépendances
  views = {
    v_matches              = "matching"
    v_approved_matches     = "matching"
    v_enrichments          = "enhanced"
    v_approved_enrichments = "enhanced"
  }

  # Une étape = un job Cloud Run, même image (pipeline/jobs)
  jobs = {
    extract-pim = { script = "extract_pim.py", timeout = "7200s", memory = "4Gi", llm = false }
    matching    = { script = "matching.py", timeout = "1800s", memory = "2Gi", llm = false }
    judge       = { script = "judge.py", timeout = "3600s", memory = "1Gi", llm = true }
    enrich      = { script = "enrich.py", timeout = "3600s", memory = "2Gi", llm = true }
    export      = { script = "export.py", timeout = "1800s", memory = "2Gi", llm = false }
  }

  placeholder_job_image = "us-docker.pkg.dev/cloudrun/container/job"

  # Identités construites à partir de leur nom (connues au plan, utilisables comme clés de for_each).
  # Les ressources qui les utilisent dépendent de module.iam_pipeline.
  pipeline_sa = {
    for k in ["load-bq", "extract-pim", "matching", "judge", "enrich", "export", "workflows", "scheduler", "eventarc"] :
    k => "serviceAccount:sa-${local.env}-${k}@${var.project_id}.iam.gserviceaccount.com"
  }

  dataset_refs = { for k, d in google_bigquery_dataset.pipeline : k => "${var.project_id}.${d.dataset_id}" }

  jobs_common_env = {
    PROJECT_ID            = var.project_id
    BQ_RAW_DATASET        = google_bigquery_dataset.pipeline["raw"].dataset_id
    BQ_MATCHING_DATASET   = google_bigquery_dataset.pipeline["matching"].dataset_id
    BQ_VALIDATION_DATASET = google_bigquery_dataset.pipeline["validation"].dataset_id
    BQ_ENHANCED_DATASET   = google_bigquery_dataset.pipeline["enhanced"].dataset_id
    FIRESTORE_DATABASE    = google_firestore_database.pipeline.name
    SCOPE_STATUS          = local.cfg.pipeline.scope_status
  }

  jobs_llm_env = {
    GCS_PROMPTS_BUCKET   = module.bucket_prompts.name
    VERTEX_LOCATION      = local.cfg.pipeline.vertex_location
    GEMINI_MODEL         = local.cfg.pipeline.gemini_model
    THINKING_LEVEL       = local.cfg.pipeline.thinking_level
    LLM_CONCURRENCY      = tostring(local.cfg.pipeline.llm_concurrency)
    JUDGE_THRESHOLD_HIGH = tostring(local.cfg.pipeline.judge_threshold_high)
    JUDGE_THRESHOLD_LOW  = tostring(local.cfg.pipeline.judge_threshold_low)
    # Vide = pas de validation automatique des enrichissements : tout passe par l'interface
    ENRICH_AUTO_VALIDATE_SCORE = local.cfg.pipeline.enrich_auto_validate_score == null ? "" : tostring(local.cfg.pipeline.enrich_auto_validate_score)
  }

  jobs_extra_env = {
    extract-pim = { PIM_API_SECRET = "${google_secret_manager_secret.pim_api_key.id}/versions/latest" }
    export      = { GCS_OUTPUT_BUCKET = module.bucket_exports.name }
  }
}

data "google_storage_project_service_account" "gcs" {
  project = var.project_id
}

# ---------- Identités (une par composant, droits minimaux) ----------
module "iam_pipeline" {
  source = "../modules/iam"

  project_id = var.project_id

  service_accounts = {
    load-bq     = { account_id = "sa-${local.env}-load-bq", display_name = "Chargement des scrapings (${local.env})", description = "Charge chaque dépôt de scraping dans BigQuery et lance le workflow." }
    extract-pim = { account_id = "sa-${local.env}-extract-pim", display_name = "Extraction PIM (${local.env})", description = "Extrait le PIM Accor (API inriver, lecture seule) dans BigQuery." }
    matching    = { account_id = "sa-${local.env}-matching", display_name = "Rapprochement (${local.env})", description = "Rapprochement déterministe des scrapings avec le PIM (brique 1)." }
    judge       = { account_id = "sa-${local.env}-judge", display_name = "Agent juge (${local.env})", description = "Agent juge des rapprochements (brique 2)." }
    enrich      = { account_id = "sa-${local.env}-enrich", display_name = "Agent d'enrichissement (${local.env})", description = "Agent d'enrichissement (brique 3)." }
    export      = { account_id = "sa-${local.env}-export", display_name = "Export (${local.env})", description = "Export du fichier plat du PIM enrichi." }
    workflows   = { account_id = "sa-${local.env}-workflows", display_name = "Workflow (${local.env})", description = "Orchestration des jobs du pipeline." }
    scheduler   = { account_id = "sa-${local.env}-scheduler", display_name = "Planificateur (${local.env})", description = "Relance périodique du workflow." }
    eventarc    = { account_id = "sa-${local.env}-eventarc", display_name = "Eventarc (${local.env})", description = "Transmet les dépôts du bucket OTA au service load-bq." }
  }

  project_roles = concat(
    [for sa in ["load-bq", "extract-pim", "matching", "judge", "enrich", "export"] : { role = "roles/bigquery.jobUser", member = local.pipeline_sa[sa] }],
    [for sa in ["load-bq", "extract-pim", "matching", "judge", "enrich", "export", "workflows"] : { role = "roles/logging.logWriter", member = local.pipeline_sa[sa] }],
    [for sa in ["extract-pim", "judge", "enrich"] : { role = "roles/datastore.user", member = local.pipeline_sa[sa] }],
    [for sa in ["judge", "enrich"] : { role = "roles/aiplatform.user", member = local.pipeline_sa[sa] }],
    [
      { role = "roles/workflows.invoker", member = local.pipeline_sa["load-bq"] },
      { role = "roles/workflows.invoker", member = local.pipeline_sa["scheduler"] },
      { role = "roles/run.jobsExecutorWithOverrides", member = local.pipeline_sa["workflows"] },
      { role = "roles/run.viewer", member = local.pipeline_sa["workflows"] },
      { role = "roles/eventarc.eventReceiver", member = local.pipeline_sa["eventarc"] },
      # Backend : requêtes BigQuery (lecture des vues, écriture des décisions)
      { role = "roles/bigquery.jobUser", member = module.iam.members["back"] },
      # CI : déploiement du workflow
      { role = "roles/workflows.editor", member = local.build_sa_member },
    ],
  )

  # La CI déploie les jobs, le service load-bq et le workflow "en tant que" leurs SA d'exécution
  service_account_iam_members = [
    for sa in ["load-bq", "extract-pim", "matching", "judge", "enrich", "export", "workflows"] :
    { sa_key = sa, role = "roles/iam.serviceAccountUser", member = local.build_sa_member }
  ]

  depends_on = [module.apis]
}

# Cloud Storage publie les événements de dépôt lus par Eventarc (une fois par projet)
resource "google_project_iam_member" "gcs_pubsub_publisher" {
  count = local.cfg.manage_project_resources ? 1 : 0

  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = data.google_storage_project_service_account.gcs.member
}

# ---------- Buckets ----------
# Les dépôts de scraping arrivent dans le bucket OTA existant (module.bucket_ota_files), dossier <source>/.
resource "google_storage_bucket_iam_member" "ota_files_load_bq" {
  bucket = module.bucket_ota_files.name
  role   = "roles/storage.objectViewer"
  member = local.pipeline_sa["load-bq"]

  depends_on = [module.iam_pipeline]
}

module "bucket_prompts" {
  source = "../modules/cloud_storage"

  project_id                = var.project_id
  name                      = "bkt-${local.base}-prompts" # copie de pipeline/prompts, synchronisée par la CI
  location                  = var.region
  versioning                = true
  noncurrent_retention_days = 90

  iam_members = [
    { role = "roles/storage.objectViewer", member = local.pipeline_sa["judge"] },
    { role = "roles/storage.objectViewer", member = local.pipeline_sa["enrich"] },
    { role = "roles/storage.objectViewer", member = local.pipeline_sa["workflows"] },
    { role = "roles/storage.objectAdmin", member = local.build_sa_member },
    { role = "roles/storage.legacyBucketReader", member = local.build_sa_member },
  ]

  depends_on = [module.iam_pipeline]
}

module "bucket_exports" {
  source = "../modules/cloud_storage"

  project_id                = var.project_id
  name                      = "bkt-${local.base}-exports" # fichiers plats du PIM enrichi, export/<date>/
  location                  = var.region
  versioning                = true
  noncurrent_retention_days = var.files_noncurrent_retention_days

  iam_members = [
    { role = "roles/storage.objectAdmin", member = local.pipeline_sa["export"] },
    { role = "roles/storage.objectViewer", member = module.iam.members["back"] },
  ]

  depends_on = [module.iam_pipeline]
}

# ---------- BigQuery ----------
resource "google_bigquery_dataset" "pipeline" {
  for_each = local.datasets

  project     = var.project_id
  dataset_id  = "${local.bq_base}_${each.key}"
  location    = var.region
  description = each.value
  labels      = local.labels

  depends_on = [module.apis]
}

resource "google_bigquery_table" "pipeline" {
  for_each = local.tables

  project             = var.project_id
  dataset_id          = google_bigquery_dataset.pipeline[each.value.dataset].dataset_id
  table_id            = each.key
  deletion_protection = true
  schema              = file("${local.pipeline_src}/schemas/${each.key}.json")
  clustering          = length(each.value.cluster) > 0 ? each.value.cluster : null

  dynamic "time_partitioning" {
    for_each = each.value.partition == null ? [] : [each.value.partition]
    content {
      type  = "DAY"
      field = time_partitioning.value
    }
  }
}

resource "google_bigquery_table" "view_matches" {
  project             = var.project_id
  dataset_id          = google_bigquery_dataset.pipeline["matching"].dataset_id
  table_id            = "v_matches"
  deletion_protection = false

  view {
    query          = templatefile("${local.pipeline_src}/views/v_matches.sql", local.dataset_refs)
    use_legacy_sql = false
  }

  depends_on = [google_bigquery_table.pipeline]
}

resource "google_bigquery_table" "view_approved_matches" {
  project             = var.project_id
  dataset_id          = google_bigquery_dataset.pipeline["matching"].dataset_id
  table_id            = "v_approved_matches"
  deletion_protection = false

  view {
    query          = templatefile("${local.pipeline_src}/views/v_approved_matches.sql", local.dataset_refs)
    use_legacy_sql = false
  }

  depends_on = [google_bigquery_table.view_matches]
}

resource "google_bigquery_table" "view_enrichments" {
  project             = var.project_id
  dataset_id          = google_bigquery_dataset.pipeline["enhanced"].dataset_id
  table_id            = "v_enrichments"
  deletion_protection = false

  view {
    query          = templatefile("${local.pipeline_src}/views/v_enrichments.sql", local.dataset_refs)
    use_legacy_sql = false
  }

  depends_on = [google_bigquery_table.pipeline]
}

resource "google_bigquery_table" "view_approved_enrichments" {
  project             = var.project_id
  dataset_id          = google_bigquery_dataset.pipeline["enhanced"].dataset_id
  table_id            = "v_approved_enrichments"
  deletion_protection = false

  view {
    query          = templatefile("${local.pipeline_src}/views/v_approved_enrichments.sql", local.dataset_refs)
    use_legacy_sql = false
  }

  depends_on = [google_bigquery_table.view_enrichments, google_bigquery_table.view_approved_matches]
}

# Moindre privilège : chaque étape lit ce dont elle a besoin et n'écrit que dans son dataset.
# Le backend lit les rapprochements et les enrichissements, et n'écrit que les décisions.
resource "google_bigquery_dataset_iam_member" "pipeline" {
  for_each = {
    "load-bq|raw"       = { member = local.pipeline_sa["load-bq"], role = "roles/bigquery.dataEditor" }
    "extract-pim|raw"   = { member = local.pipeline_sa["extract-pim"], role = "roles/bigquery.dataEditor" }
    "matching|raw"      = { member = local.pipeline_sa["matching"], role = "roles/bigquery.dataViewer" }
    "matching|matching" = { member = local.pipeline_sa["matching"], role = "roles/bigquery.dataEditor" }
    "judge|matching"    = { member = local.pipeline_sa["judge"], role = "roles/bigquery.dataEditor" }
    "enrich|raw"        = { member = local.pipeline_sa["enrich"], role = "roles/bigquery.dataViewer" }
    "enrich|matching"   = { member = local.pipeline_sa["enrich"], role = "roles/bigquery.dataViewer" }
    "enrich|validation" = { member = local.pipeline_sa["enrich"], role = "roles/bigquery.dataViewer" }
    "enrich|enhanced"   = { member = local.pipeline_sa["enrich"], role = "roles/bigquery.dataEditor" }
    "export|matching"   = { member = local.pipeline_sa["export"], role = "roles/bigquery.dataViewer" }
    "export|validation" = { member = local.pipeline_sa["export"], role = "roles/bigquery.dataViewer" }
    "export|enhanced"   = { member = local.pipeline_sa["export"], role = "roles/bigquery.dataEditor" }
    "back|matching"     = { member = module.iam.members["back"], role = "roles/bigquery.dataViewer" }
    "back|enhanced"     = { member = module.iam.members["back"], role = "roles/bigquery.dataViewer" }
    "back|validation"   = { member = module.iam.members["back"], role = "roles/bigquery.dataEditor" }
  }

  project    = var.project_id
  dataset_id = google_bigquery_dataset.pipeline[split("|", each.key)[1]].dataset_id
  role       = each.value.role
  member     = each.value.member

  depends_on = [module.iam_pipeline]
}

# ---------- Firestore : baux et état des étapes (collection pipeline_runs) ----------
resource "google_firestore_database" "pipeline" {
  project                           = var.project_id
  name                              = "fs-${local.base}"
  location_id                       = var.region
  type                              = "FIRESTORE_NATIVE"
  concurrency_mode                  = "OPTIMISTIC"
  app_engine_integration_mode       = "DISABLED"
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_DISABLED"
  delete_protection_state           = "DELETE_PROTECTION_DISABLED"
  deletion_policy                   = "DELETE"

  # module.iam pose roles/datastore.owner au SA Terraform (environnement qui gère les ressources du projet)
  depends_on = [module.apis, module.iam]
}

# ---------- Secret : clé API du PIM Accor (lecture seule) ----------
# Créé vide : la valeur est ajoutée à la main (voir pipeline/README.md), jamais dans le code ni dans Terraform.
resource "google_secret_manager_secret" "pim_api_key" {
  project   = var.project_id
  secret_id = "secret-${local.base}-pim-api-key"
  labels    = local.labels

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [module.apis]
}

resource "google_secret_manager_secret_iam_member" "pim_api_key_extract" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.pim_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = local.pipeline_sa["extract-pim"]

  depends_on = [module.iam_pipeline]
}

# ---------- Jobs du pipeline ----------
module "pipeline_jobs" {
  source   = "../modules/cloud_run_job"
  for_each = local.jobs

  project_id            = var.project_id
  region                = var.region
  name                  = "gcrj-${local.base}-${each.key}"
  image                 = local.placeholder_job_image
  args                  = [each.value.script]
  service_account_email = module.iam_pipeline.emails[each.key]
  timeout               = each.value.timeout
  # Une étape en échec est reprise par l'exécution suivante (traitement incrémental, baux Firestore)
  max_retries = 0
  cpu         = "2"
  memory      = each.value.memory
  labels      = { component = "pipeline" }

  env = merge(
    local.jobs_common_env,
    each.value.llm ? local.jobs_llm_env : {},
    lookup(local.jobs_extra_env, each.key, {}),
  )

  iam_members = concat(
    [{ role = "roles/run.developer", member = local.build_sa_member }],
    # Le backend lance l'export depuis l'interface
    each.key == "export" ? [{ role = "roles/run.invoker", member = module.iam.members["back"] }] : [],
  )

  depends_on = [module.apis, module.iam_pipeline]
}

# ---------- Chargement des dépôts ----------
module "cloud_run_load_bq" {
  source = "../modules/cloud_run"

  project_id            = var.project_id
  region                = var.region
  name                  = "gcr-${local.base}-load-bq"
  image                 = local.placeholder_image
  service_account_email = module.iam_pipeline.emails["load-bq"]
  min_instances         = 0
  max_instances         = 3
  memory                = "1Gi"
  health_check_path     = "/healthz"
  labels                = { component = "pipeline" }

  # Seul Eventarc l'appelle
  invoker_members = [local.pipeline_sa["eventarc"]]

  iam_members = [
    { role = "roles/run.developer", member = local.build_sa_member },
  ]

  env = {
    BQ_PROJECT_ID = var.project_id
    BQ_DATASET_ID = google_bigquery_dataset.pipeline["raw"].dataset_id
    WORKFLOW_NAME = google_workflows_workflow.enrichment.id
  }

  depends_on = [module.apis, module.iam_pipeline]
}

resource "google_eventarc_trigger" "ota_files_to_load_bq" {
  project         = var.project_id
  name            = "evt-${local.base}-load-bq"
  location        = var.region
  service_account = module.iam_pipeline.emails["eventarc"]
  labels          = local.labels

  matching_criteria {
    attribute = "type"
    value     = "google.cloud.storage.object.v1.finalized"
  }

  matching_criteria {
    attribute = "bucket"
    value     = module.bucket_ota_files.name
  }

  destination {
    cloud_run_service {
      service = module.cloud_run_load_bq.name
      region  = var.region
      path    = "/"
    }
  }

  # Un dépôt n'est jamais chargé deux fois : pas de nouvelle tentative
  retry_policy {
    max_attempts = 1
  }

  depends_on = [google_project_iam_member.gcs_pubsub_publisher]
}

# ---------- Workflow ----------
# Code déployé par la CI (pipeline/workflow/workflow.yaml) ; Terraform crée une coquille.
resource "google_workflows_workflow" "enrichment" {
  project             = var.project_id
  name                = "wf-${local.base}-enrichment"
  region              = var.region
  description         = "Pipeline d'enrichissement : extraction PIM, rapprochement, agent juge, agent d'enrichissement"
  service_account     = module.iam_pipeline.emails["workflows"]
  call_log_level      = "LOG_ERRORS_ONLY"
  deletion_protection = false
  labels              = local.labels

  source_contents = <<-EOF
  main:
    steps:
      - placeholder:
          return: "déployé par Cloud Build"
  EOF

  lifecycle {
    ignore_changes = [source_contents, user_env_vars]
  }

  depends_on = [module.apis]
}

# Toutes les 15 minutes, sans extraction du PIM : reprend les rapprochements décidés dans l'interface.
# Créé en pause : le reprendre quand la chaîne a tourné de bout en bout.
resource "google_cloud_scheduler_job" "enrichment" {
  project          = var.project_id
  name             = "sched-${local.base}-enrichment"
  region           = var.region
  description      = "Relance le workflow d'enrichissement (décisions prises dans l'interface)"
  schedule         = "*/15 * * * *"
  time_zone        = "Europe/Paris"
  attempt_deadline = "600s"
  paused           = local.cfg.pipeline.scheduler_paused

  http_target {
    uri         = "https://workflowexecutions.googleapis.com/v1/${google_workflows_workflow.enrichment.id}/executions"
    http_method = "POST"
    headers     = { "Content-Type" = "application/json" }
    body        = base64encode(jsonencode({ argument = jsonencode({ skip_extract = true }) }))

    oauth_token {
      service_account_email = module.iam_pipeline.emails["scheduler"]
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }

  depends_on = [module.apis]
}
