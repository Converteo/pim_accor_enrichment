"""Step 1 - read-only extraction of the Accor PIM (inriver REST API) into BigQuery raw tables.

Only GET calls and the three read POST endpoints (query, entities:mapuniquevalues, entities:fetchdata) are used;
PimClient refuses any other POST. The API key is read from Secret Manager.

Writes (replaced at each extraction, the PIM is a snapshot):
  raw.pim_product          one row per hotel: entity_id + PIM field ids (raw values, CVL keys untranslated)
  raw.pim_<entity>         one row per linked entity (parking, pool, ...) with its hotel's entity_id and RID
  raw.pim_model            fields: entity type, label, data type, CVL, multi-value
  raw.pim_cvl_values       CVL keys and English labels
Personal data (contacts, phones, e-mails, names) is never extracted.

Light on the API (same method as the audit: ~390 data calls plus one per value list, ~5 minutes for ~7,800 hotels):
  - only the fields kept below and the linked entity types used by the enrichment are requested (fieldTypeIds,
    outbound linkTypeIds), by batches of BATCH hotels
  - at most MAX_WORKERS calls at a time, halved while the API is saturated (429, 5xx), Retry-After honoured
  - a refused key (401, 403) or an API still failing after the retries stops the extraction at once: the batches
    not sent yet are cancelled; only a timed-out batch is split in two (hotels with many linked entities)
Refreshed when new scrapings arrive: the workflow runs this job only for a deposit, with its time (DEPOSITED_AT).
The PIM is extracted unless an extraction finished after that deposit (several files of one sharing, a file deposited
during an extraction): then it is reused. Without DEPOSITED_AT (run by hand), it is extracted. When another execution
is extracting, this one waits for it to finish, so that the enrichment never runs on a PIM being loaded.
"""

import logging
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import requests
from google.cloud import bigquery, secretmanager

import bq
from config import Settings
from state import open_state
from throttle import AdaptiveLimit

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
# Linked entities the enrichment agent can create or complete: link type -> entity type
LINKS = {
    "ProductPool": "Pool", "ProductParking": "Parking", "ProductWellnessCenter": "WellnessCenter",
    "ProductFitnessCenter": "FitnessCenter", "ProductBar": "Bar", "ProductBreakfast": "Breakfast",
    "ProductRestaurant": "Restaurant", "ProductSport": "Sport",
}
LINKED_TYPES = tuple(LINKS.values())
EXCLUDED_SUFFIXES = (
    "Comment", "MigrationExcludedFields", "TranslationStatus", "DocumentTicket", "ACRSLanguage", "Translate", "CRC",
    "SourceLocale", "SourceLocaleOriginal", "Market", "MarketOriginal", "TranslationProcess", "TranslationBillingGroup",
    "TranslationMemory", "IntermediateTargetLanguage", "ChildrenIncrementalSeedData", "Input", "Origin",
    "TranslationTimestamps", "TranslationStatusTracking", "DataMigrationLog",
)
PII_MARKERS = ("Contact", "Chef", "Phone", "Mobile", "Email", "FirstName", "LastName", "Fax", "Manager", "Director")

BATCH = 20          # hotels per fetchdata call (the audit's setting)
MAX_WORKERS = 4     # calls at the same time, at most
RETRIES = 5         # attempts of one call on 429 / 5xx / connection error
MAX_WAIT = 120      # longest pause between two attempts, in seconds
TIMEOUT = 300
WAIT_POLL = 30      # seconds between two checks while another execution is extracting


class PimAuthError(Exception):
    """The API refused the key (401, 403): nothing else is sent."""


class PimUnavailable(Exception):
    """The API still answers 429 / 5xx after the retries: the extraction stops."""


class PimTimeout(Exception):
    """A call timed out: the batch may be too heavy and is split by the caller."""


class PimStopped(Exception):
    """Another call failed for good: this one is not sent."""


def retry_wait(resp, attempt: int) -> float:
    header = resp.headers.get("Retry-After") if resp is not None else None
    if header and header.strip().isdigit():
        return min(float(header), MAX_WAIT)
    return min(5.0 * 2 ** attempt, MAX_WAIT)


class PimClient:
    def __init__(self, api_key: str, limit: AdaptiveLimit | None = None, session=None, sleep=time.sleep):
        self.session = session or requests.Session()
        self.session.headers.update({"X-inRiver-APIKey": api_key, "Content-Type": "application/json"})
        self.limit = limit or AdaptiveLimit(1, "PIM API")
        self.sleep = sleep
        self.calls = 0
        # Set at the first fatal error: no call (first attempt or retry) leaves after it
        self.stopped = threading.Event()

    def _call(self, method: str, path: str, body=None):
        for attempt in range(RETRIES):
            resp = None
            with self.limit:
                if self.stopped.is_set():
                    raise PimStopped(f"{method} {path}")
                self.calls += 1
                try:
                    resp = self.session.request(method, BASE_URL + path, json=body, timeout=TIMEOUT)
                except requests.exceptions.Timeout as e:
                    self.limit.saturated()
                    raise PimTimeout(f"{method} {path}") from e
                except requests.exceptions.ConnectionError:
                    resp = None
            if resp is not None and resp.status_code in (401, 403):
                raise PimAuthError(f"{method} {path}: HTTP {resp.status_code}, key refused")
            if resp is None or resp.status_code in (429, 500, 502, 503, 504):
                self.limit.saturated()
                if attempt == RETRIES - 1:
                    raise PimUnavailable(f"{method} {path}: {'no answer' if resp is None else resp.status_code} after {RETRIES} attempts")
                self.sleep(retry_wait(resp, attempt))
                continue
            resp.raise_for_status()
            self.limit.succeeded()
            return resp.json()

    def get(self, path: str):
        return self._call("GET", path)

    def read_post(self, path: str, body: dict):
        if path not in READ_POSTS:
            raise PermissionError(f"POST {path} is not a read endpoint")
        return self._call("POST", path, body)


def fetch(pim: PimClient, batch: list, request: dict) -> list:
    """Hotels of one batch with their linked entities; a timed-out batch is split in two."""
    try:
        return pim.read_post("/v1.0.1/entities:fetchdata", {**request, "entityIds": batch})
    except PimTimeout:
        if len(batch) == 1:
            raise
        half = len(batch) // 2
        logger.info("Batch of %d hotels timed out: split", len(batch))
        return fetch(pim, batch[:half], request) + fetch(pim, batch[half:], request)


def fetch_all(pim: PimClient, batches: list[list], request: dict, workers: int = MAX_WORKERS):
    """Results of the batches, in order. The first error cancels the batches not started and is raised."""
    def task(batch):
        try:
            return fetch(pim, batch, request)
        except Exception:
            pim.stopped.set()
            raise

    pool = ThreadPoolExecutor(max_workers=workers)
    futures = [pool.submit(task, b) for b in batches]
    try:
        for n, future in enumerate(futures, 1):
            yield future.result()
            if n % 50 == 0:
                logger.info("batch %d/%d (%d calls)", n, len(batches), pim.calls)
    except BaseException:
        pim.stopped.set()
        pool.shutdown(wait=True, cancel_futures=True)
        raise
    pool.shutdown(wait=True)


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


def acquire_or_wait(state, run_id: str, lease_seconds: int, sleep=time.sleep, clock=time.monotonic) -> dict:
    """Take the extraction lease, waiting while another execution holds it; return the state document."""
    deadline = clock() + lease_seconds
    while True:
        acquired, data = state.acquire(run_id, lease_seconds)
        if acquired:
            return data
        if clock() > deadline:
            raise TimeoutError("Another extraction has held the lease for too long")
        logger.info("Another execution is extracting the PIM: waiting for it to finish")
        sleep(WAIT_POLL)


def needs_extraction(last_success_at: datetime | None, deposited_at: datetime | None, force: bool = False) -> bool:
    """Extract unless the last extraction finished after the deposit that started this run."""
    if force or deposited_at is None or last_success_at is None:
        return True
    return last_success_at < deposited_at


def run(settings: Settings) -> int:
    state = open_state(settings, "extract_pim")
    data = acquire_or_wait(state, settings.run_id, settings.lease_seconds)
    last = data.get("last_success_at")
    if not needs_extraction(last, settings.deposited_at, settings.force):
        logger.info("PIM extracted at %s, after the deposit of %s: reused", last, settings.deposited_at)
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
    pim = PimClient(api_key(settings), AdaptiveLimit(MAX_WORKERS, "PIM API"))
    client = bigquery.Client(project=settings.project_id)
    now = datetime.now(timezone.utc)
    started = time.monotonic()

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

    # Only the kept fields and the linked types used by the enrichment travel (the filter applies to linked entities too)
    request = {
        "objects": "EntitySummary,FieldValues",
        "fieldTypeIds": ",".join(c for cols in columns.values() for c in cols),
        "outbound": {"linkTypeIds": ",".join(LINKS), "objects": "EntitySummary,FieldValues"},
    }
    products, linked = [], {et: [] for et in LINKED_TYPES}
    batches = [ids[i:i + BATCH] for i in range(0, len(ids), BATCH)]
    for result in fetch_all(pim, batches, request):
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

    base = ["entity_id", "created_date", "modified_date"]
    link_base = ["product_entity_id", "rid", "link_type", "link_index", *base]
    bq.load(client, settings.table("raw", "pim_product"), products, string_schema(base + columns["Product"]), truncate=True)
    for et, data in linked.items():
        bq.load(client, settings.table("raw", f"pim_{et.lower()}"), data, string_schema(link_base + columns[et]), truncate=True)
    bq.load(client, settings.table("raw", "pim_model"), model_rows, bq.schema("pim_model"), truncate=True)
    bq.load(client, settings.table("raw", "pim_cvl_values"), cvl_rows, bq.schema("pim_cvl_values"), truncate=True)

    stats = {"hotels": len(products), **{f"entites_{et}": len(v) for et, v in linked.items()}, "cvl_values": len(cvl_rows),
             "api_calls": pim.calls, "minutes": round((time.monotonic() - started) / 60, 1)}
    logger.info("Extraction finished: %s", stats)
    return stats


def main() -> int:
    return run(Settings.from_env())


if __name__ == "__main__":
    sys.exit(main())
