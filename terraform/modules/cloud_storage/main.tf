resource "google_storage_bucket" "this" {
  name     = var.name
  project  = var.project_id
  location = upper(var.location)
  labels   = var.labels

  storage_class               = var.storage_class
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = var.force_destroy

  versioning {
    enabled = var.versioning
  }

  dynamic "lifecycle_rule" {
    for_each = var.noncurrent_versions_to_keep == null ? [] : [var.noncurrent_versions_to_keep]
    content {
      condition {
        num_newer_versions = lifecycle_rule.value
        with_state         = "ARCHIVED"
      }
      action {
        type = "Delete"
      }
    }
  }

  dynamic "lifecycle_rule" {
    for_each = var.delete_after_days == null ? [] : [var.delete_after_days]
    content {
      condition {
        age = lifecycle_rule.value
      }
      action {
        type = "Delete"
      }
    }
  }

  dynamic "lifecycle_rule" {
    for_each = var.noncurrent_retention_days == null ? [] : [var.noncurrent_retention_days]
    content {
      condition {
        days_since_noncurrent_time = lifecycle_rule.value
        with_state                 = "ARCHIVED"
      }
      action {
        type = "Delete"
      }
    }
  }
}

resource "google_storage_bucket_iam_member" "this" {
  for_each = { for b in var.iam_members : "${b.role}|${b.member}" => b }

  bucket = google_storage_bucket.this.name
  role   = each.value.role
  member = each.value.member
}
