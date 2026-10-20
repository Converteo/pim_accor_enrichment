"""Step 5 (last lot) - flat file of the enriched PIM, ready to be loaded into the PIM by Accor.

PROVISIONAL FORMAT: to be aligned with the inriver import specification Accor will provide
(columns, identifiers, multi-values, creation of linked entities).

Runs only when nothing is waiting for a decision (no match needs_review, no value proposed), unless FORCE=true.
Writes to gs://<output bucket>/export/<yyyymmdd-hhmmss>/ :
  pim_product.csv         one row per hotel: PIM entity id, RID, then one column per enriched field (PIM codes)
  pim_<entity>.csv        one row per linked entity: entity id (or NEW-<RID>-<n> to create), hotel entity id, RID, fields
  traceability.csv        one row per value: source, excerpt, score, decision, author
CSV separated by « ; », UTF-8 with BOM, multi-values separated by « | ».
"""

import csv
import io
import logging
import sys
import uuid
from datetime import datetime, timezone

from google.cloud import bigquery, storage

import bq
from config import Settings
from enrichment_core import is_new

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

TRACE_COLUMNS = ["rid", "entity", "entity_id", "pim_field", "label", "priority", "pim_value", "final_value", "value_label",
                 "method", "source", "source_field", "source_excerpt", "score", "warning", "final_status", "author", "decided_at",
                 "comment", "llm_model", "prompt_version", "enriched_at"]


def pending(client: bigquery.Client, settings: Settings) -> dict:
    return bq.rows(client, f"""
        SELECT
          (SELECT COUNT(*) FROM `{settings.table('matching', 'v_matches')}` WHERE final_status IN ('needs_review', 'pending_judgment')) AS matches,
          (SELECT COUNT(*) FROM `{settings.table('enhanced', 'v_enrichments')}` e
           WHERE final_status = 'proposed'
             AND EXISTS (SELECT 1 FROM `{settings.table('matching', 'v_approved_matches')}` r WHERE r.rid = e.rid AND r.source = e.source)
          ) AS enrichments
    """)[0]


def to_csv(header: list[str], data: list[dict]) -> str:
    out = io.StringIO()
    out.write("﻿")
    writer = csv.DictWriter(out, fieldnames=header, delimiter=";", extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    for r in data:
        writer.writerow({k: ("" if r.get(k) is None else str(r.get(k)).replace("\n", " ").replace("\r", " ")) for k in header})
    return out.getvalue()


def flat_files(values: list[dict]) -> dict[str, str]:
    """File name -> CSV content."""
    files = {}
    products: dict[str, dict] = {}
    entities: dict[str, dict[str, dict]] = {}
    product_fields, entity_fields = set(), {}
    for v in values:
        if v["entity"] == "Product":
            row = products.setdefault(v["rid"], {"sys_id": v["pim_entity_id"], "ProductRid": v["rid"]})
            row[v["pim_field"]] = v["final_value"]
            product_fields.add(v["pim_field"])
        else:
            key = f"NEW-{v['rid']}-{v['entity_id']}" if is_new(v["entity_id"]) else v["entity_id"]
            row = entities.setdefault(v["entity"], {}).setdefault(key, {
                "sys_id": key, "parent_sys_id": v["pim_entity_id"], "ProductRid": v["rid"], "to_create": is_new(v["entity_id"])})
            row[v["pim_field"]] = v["final_value"]
            entity_fields.setdefault(v["entity"], set()).add(v["pim_field"])
    if products:
        files["pim_product.csv"] = to_csv(["sys_id", "ProductRid", *sorted(product_fields)], list(products.values()))
    for et, rows in entities.items():
        files[f"pim_{et.lower()}.csv"] = to_csv(["sys_id", "parent_sys_id", "ProductRid", "to_create", *sorted(entity_fields[et])], list(rows.values()))
    files["traceability.csv"] = to_csv(TRACE_COLUMNS, values)
    return files


def run(settings: Settings) -> int:
    client = bigquery.Client(project=settings.project_id)
    waiting = pending(client, settings)
    if (waiting["matches"] or waiting["enrichments"]) and not settings.force:
        logger.info("Export not started, still waiting for decisions: %s", waiting)
        return 0
    values = bq.rows(client, f"SELECT * FROM `{settings.table('enhanced', 'v_approved_enrichments')}` ORDER BY rid, entity, entity_id, pim_field")
    if not values:
        logger.info("No validated value to export")
        return 0
    now = datetime.now(timezone.utc)
    prefix = f"export/{now:%Y%m%d-%H%M%S}"
    bucket = storage.Client(project=settings.project_id).bucket(settings.output_bucket)
    files = flat_files(values)
    for name, content in files.items():
        bucket.blob(f"{prefix}/{name}").upload_from_string(content.encode("utf-8"), content_type="text/csv")
    bq.load(client, settings.table("enhanced", "exports"), [{
        "export_id": uuid.uuid4().hex, "path": f"gs://{settings.output_bucket}/{prefix}/", "row_count": len(values),
        "hotel_count": len({v["rid"] for v in values}), "files": ", ".join(sorted(files)), "triggered_by": settings.run_id, "exported_at": now,
    }], bq.schema("exports"))
    logger.info("Exported %d values of %d hotels to gs://%s/%s/", len(values), len({v['rid'] for v in values}), settings.output_bucket, prefix)
    return 0


def main() -> int:
    return run(Settings.from_env())


if __name__ == "__main__":
    sys.exit(main())
