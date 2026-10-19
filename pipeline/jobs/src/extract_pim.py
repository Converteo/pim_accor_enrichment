"""Step 1b - read-only extraction of the Accor PIM (inriver REST API) into BigQuery raw tables.

Only GET calls and the three read POST endpoints (query, entities:mapuniquevalues, entities:fetchdata) are used;
PimClient refuses any other POST. The API key is read from Secret Manager.

Writes (replaced at each extraction, the PIM is a snapshot):
  raw.pim_product          one row per hotel: entity_id + PIM field ids (raw values, CVL keys untranslated)
  raw.pim_<entity>         one row per linked entity (parking, pool, ...) with its hotel's entity_id and RID
  raw.pim_model            fields: entity type, label, data type, CVL, multi-value
  raw.pim_cvl_values       CVL keys and English labels
Personal data (contacts, phones, e-mails, names) is never extracted.
Skipped when the last extraction is younger than PIM_MAX_AGE_HOURS, unless FORCE=true.
"""

import logging
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import requests
from google.cloud import bigquery, secretmanager

import bq
from config import Settings
from state import open_state

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

BASE_URL = "https://api-prod1a-euw.productmarketingcloud.com/api"
READ_POSTS = ("/v1.0.0/query", "/v1.0.0/entities:mapuniquevalues", "/v1.0.1/entities:fetchdata")

# Hotel field categories close to the scraped content; contacts, bank, accounting, B2B, programs... are left out
PRODUCT_CATEGORIES = {
    "GeneralInformation", "Adress", "Accessibility", "AmenitiesServices", "AmenitiesServicesWeb",
    "BuildingInventory", "Environment", "FamilyChildrenWeb", "FoodBeverageInRoom", "FoodBeverageWeb",
    "HotelEContentWeb", "HotelSecurity", "Ratings", "ReceptionAndReservationInformation",
    "RoomInformation", "WellnessFitnessWeb", "TUServices",
}
PRODUCT_EXTRA_FIELDS = {
    "ProductSalesStatus", "ProductLastUpdateDate", "ProductOldBrand", "ProductRebrandingDate", "ProductBrand",
}
# Linked entities the enrichment agent can create or complete
LINKED_TYPES = ("Pool", "Parking", "WellnessCenter", "FitnessCenter", "Bar", "Breakfast", "Restaurant", "Sport")
EXCLUDED_SUFFIXES = (
    "Comment", "MigrationExcludedFields", "TranslationStatus", "DocumentTicket", "ACRSLanguage", "Translate", "CRC",
    "SourceLocale", "SourceLocaleOriginal", "Market", "MarketOriginal", "TranslationProcess", "TranslationBillingGroup",
    "TranslationMemory", "IntermediateTargetLanguage", "ChildrenIncrementalSeedData", "Input", "Origin",
    "TranslationTimestamps", "TranslationStatusTracking", "DataMigrationLog",
)
PII_MARKERS = ("Contact", "Chef", "Phone", "Mobile", "Email", "FirstName", "LastName", "Fax", "Manager", "Director")
BATCH = 5


class PimClient:
    def __init__(self, api_key: str):
        self.session = requests.Session()
        self.session.headers.update({"X-inRiver-APIKey": api_key, "Content-Type": "application/json"})

    def _call(self, method: str, path: str, body=None):
        for attempt in range(5):
            try:
                resp = self.session.request(method, BASE_URL + path, json=body, timeout=300)
            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
                if attempt == 4:
                    raise
                time.sleep(2 ** attempt)
                continue
            if resp.status_code in (429, 500, 502, 503, 504) and attempt < 4:
                time.sleep(2 ** attempt)
                continue
            resp.raise_for_status()
            return resp.json()

    def get(self, path: str):
        return self._call("GET", path)

    def read_post(self, path: str, body: dict):
        if path not in READ_POSTS:
            raise PermissionError(f"POST {path} is not a read endpoint")
        return self._call("POST", path, body)


def keep(entity_type: str, field: dict) -> bool:
    field_id = field["fieldTypeId"]
    suffix = field_id[len(entity_type):]
    if suffix.endswith(EXCLUDED_SUFFIXES) or any(m in suffix for m in PII_MARKERS):
        return False
    if entity_type == "Product":
        return field["categoryId"] in PRODUCT_CATEGORIES or field_id in PRODUCT_EXTRA_FIELDS or field_id == "ProductRid"
    return True


def raw_value(value):
    """Raw value as a string: English text of a translated field, CVL keys joined by |."""
    if value is None:
        return None
    if isinstance(value, dict):
        value = value.get("en")
    if isinstance(value, list):
        return "|".join(str(v) for v in value) or None
    if isinstance(value, bool):
        return "True" if value else "False"
    return None if value == "" else str(value)


def string_schema(columns: list[str]) -> list[bigquery.SchemaField]:
    return [bigquery.SchemaField(c, "STRING") for c in columns] + [bigquery.SchemaField("load_dts", "TIMESTAMP")]


def api_key(settings: Settings) -> str:
    client = secretmanager.SecretManagerServiceClient()
    return client.access_secret_version(name=settings.pim_api_secret).payload.data.decode().strip()


def run(settings: Settings) -> int:
    state = open_state(settings, "extract_pim")
    acquired, data = state.acquire(settings.run_id, settings.lease_seconds)
    if not acquired:
        logger.info("Extraction already running, nothing to do")
        return 0
    last = data.get("last_success_at")
    if not settings.force and last and last > datetime.now(timezone.utc) - timedelta(hours=settings.pim_max_age_hours):
        logger.info("PIM extracted at %s, younger than %dh: skipped", last, settings.pim_max_age_hours)
        state.release(settings.run_id, success=False)
        return 0
    try:
        stats = extract(settings)
    except Exception:
        state.release(settings.run_id, success=False)
        raise
    state.release(settings.run_id, success=True, stats=stats)
    return 0


def extract(settings: Settings) -> dict:
    pim = PimClient(api_key(settings))
    client = bigquery.Client(project=settings.project_id)
    now = datetime.now(timezone.utc)

    model = {e["id"]: e for e in pim.get("/v1.0.0/model/entitytypes")}
    fields = {et: [f for f in model[et]["fieldTypes"] if keep(et, f)] for et in ("Product", *LINKED_TYPES)}
    columns = {et: [f["fieldTypeId"] for f in fs] for et, fs in fields.items()}

    model_rows = [{"entity_type": et, "field_id": f["fieldTypeId"], "label": f["fieldTypeDisplayName"],
                   "data_type": f["fieldDataType"], "cvl_id": f.get("cvlId"), "multivalue": bool(f.get("isMultiValue")),
                   "category": f.get("categoryId")} for et, fs in fields.items() for f in fs]
    cvl_ids = sorted({r["cvl_id"] for r in model_rows if r["cvl_id"]})
    cvl_rows = []
    for cvl_id in cvl_ids:
        for v in pim.get(f"/v1.0.0/model/cvls/{cvl_id}/values"):
            value = v.get("value")
            cvl_rows.append({"cvl_id": cvl_id, "cle": v["key"], "libelle": raw_value(value) or v["key"]})

    ids = pim.read_post("/v1.0.0/query", {"systemCriteria": [{"type": "EntityTypeId", "value": "Product", "operator": "Equal"}]})["entityIds"]
    logger.info("%d hotels to extract", len(ids))

    def fetch(batch):
        try:
            return pim.read_post("/v1.0.1/entities:fetchdata", {
                "entityIds": batch, "objects": "EntitySummary,FieldValues",
                "outbound": {"objects": "EntitySummary,FieldValues"},
            })
        except Exception:
            # Batch too heavy (hotels with many linked entities): split it
            if len(batch) == 1:
                raise
            half = len(batch) // 2
            return fetch(batch[:half]) + fetch(batch[half:])

    products, linked = [], {et: [] for et in LINKED_TYPES}
    batches = [ids[i:i + BATCH] for i in range(0, len(ids), BATCH)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for n, result in enumerate(pool.map(fetch, batches), 1):
            for hotel in result:
                values = {fv["fieldTypeId"]: fv["value"] for fv in hotel.get("fieldValues", [])}
                summary = hotel["summary"]
                row = {"entity_id": str(hotel["entityId"]), "created_date": summary.get("createdDate"),
                       "modified_date": summary.get("modifiedDate"), "load_dts": now}
                row.update({c: raw_value(values.get(c)) for c in columns["Product"]})
                products.append(row)
                for link in hotel.get("outbound", []):
                    et = link["summary"]["entityTypeId"]
                    if et not in linked:
                        continue
                    lv = {fv["fieldTypeId"]: fv["value"] for fv in link.get("fieldValues", [])}
                    lrow = {"product_entity_id": str(hotel["entityId"]), "rid": row.get("ProductRid"),
                            "link_type": link.get("linkTypeId"), "link_index": str(link.get("linkIndex")),
                            "entity_id": str(link["summary"]["id"]), "created_date": link["summary"].get("createdDate"),
                            "modified_date": link["summary"].get("modifiedDate"), "load_dts": now}
                    lrow.update({c: raw_value(lv.get(c)) for c in columns[et]})
                    linked[et].append(lrow)
            if n % 100 == 0:
                logger.info("batch %d/%d", n, len(batches))

    base = ["entity_id", "created_date", "modified_date"]
    link_base = ["product_entity_id", "rid", "link_type", "link_index", *base]
    bq.load(client, settings.table("raw", "pim_product"), products, string_schema(base + columns["Product"]), truncate=True)
    for et, data in linked.items():
        bq.load(client, settings.table("raw", f"pim_{et.lower()}"), data, string_schema(link_base + columns[et]), truncate=True)
    bq.load(client, settings.table("raw", "pim_model"), model_rows, bq.schema("pim_model"), truncate=True)
    bq.load(client, settings.table("raw", "pim_cvl_values"), cvl_rows, bq.schema("pim_cvl_values"), truncate=True)

    stats = {"hotels": len(products), **{f"entites_{et}": len(v) for et, v in linked.items()}, "cvl_values": len(cvl_rows)}
    logger.info("Extraction finished: %s", stats)
    return stats


def main() -> int:
    return run(Settings.from_env())


if __name__ == "__main__":
    sys.exit(main())
