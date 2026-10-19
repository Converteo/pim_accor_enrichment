"""Read access to the PIM data loaded in BigQuery (raw.pim_*), with CVL keys translated to English labels."""

import re

from google.cloud import bigquery

import bq
from matching_rules import normalize_rid
from sources import PIM_IDENTITY


def norm_status(s) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s or "").lower())


def cvl_labels(client: bigquery.Client, settings) -> dict[tuple[str, str], str]:
    """(cvl_id, key) -> English label."""
    data = bq.rows(client, f"SELECT cvl_id, cle, libelle FROM `{settings.table('raw', 'pim_cvl_values')}`")
    return {(r["cvl_id"], r["cle"]): r["libelle"] for r in data}


def field_model(client: bigquery.Client, settings) -> dict[str, dict]:
    """field id -> {entity_type, data_type, cvl_id, multivalue, label}."""
    data = bq.rows(client, f"SELECT * FROM `{settings.table('raw', 'pim_model')}`")
    return {r["field_id"]: r for r in data}


def label(value, cvl_id, labels) -> str | None:
    if value in (None, ""):
        return None
    if not cvl_id:
        return value
    return " | ".join(labels.get((cvl_id, k), k) for k in str(value).split("|"))


def hotels_in_scope(client: bigquery.Client, settings, labels, model) -> dict[str, dict]:
    """RID -> identity of the hotel (labels), for hotels whose sales status is in scope (Open, Pre-opening)."""
    cols = ", ".join(f"`{c}` AS {k}" for k, c in PIM_IDENTITY.items())
    data = bq.rows(client, f"SELECT entity_id, {cols} FROM `{settings.table('raw', 'pim_product')}`")
    wanted = {norm_status(s) for s in settings.scope_status}
    hotels = {}
    for r in data:
        cvl = {k: (model.get(c) or {}).get("cvl_id") for k, c in PIM_IDENTITY.items()}
        status_label = label(r["status"], cvl["status"], labels)
        if norm_status(r["status"]) not in wanted and norm_status(status_label) not in wanted:
            continue
        hotel = {k: label(r[k], cvl[k], labels) for k in PIM_IDENTITY}
        hotel["country_code"] = r["country"]
        hotel["entity_id"] = r["entity_id"]
        hotel["rid"] = normalize_rid(r["rid"])
        if hotel["rid"]:
            hotels[hotel["rid"]] = hotel
    return hotels
