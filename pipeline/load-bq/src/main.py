"""Load a scraping deposit into its raw table, then start the enrichment workflow (Cloud Run service).

Eventarc posts here when a file lands in the OTA files bucket at <source>/<file>.csv (CSV, ";", UTF-8):
  1. headers turned into snake_case BigQuery names
  2. file loaded into a temporary table, every column as STRING
  3. rows appended to raw.<source> with the deposit id and the load timestamp; new columns are added on the fly,
     so a deposit with other or reordered columns still lands by column name
  4. workflow wf-enrichment started with {"source", "depot_id"}
Each deposit is kept (no truncation), so two scrapings of the same source can be compared. The file stays in the
bucket (versioned). Other objects of the bucket (outside a <source>/ folder, or not CSV) are ignored.
"""

import csv
import io
import json
import os
import re
import unicodedata
import uuid
from datetime import datetime, timezone

from cloudevents.http import from_http
from flask import Flask, request
from google.cloud import bigquery, storage
from google.cloud.workflows import executions_v1

app = Flask(__name__)
_clients: dict = {}

BQ_COLUMN_MAX_LENGTH = 300
RESERVED = {"depot_id", "load_dts"}


def client(name: str):
    if name not in _clients:
        _clients[name] = {"storage": storage.Client, "bigquery": bigquery.Client,
                          "workflows": executions_v1.ExecutionsClient}[name]()
    return _clients[name]


def bq_column_name(name, index: int) -> str:
    text = str(name or "").strip().lstrip("﻿")
    ascii_name = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    snake = re.sub(r"[^a-z0-9]+", "_", ascii_name.lower()).strip("_") or f"colonne_{index}"
    if snake[0].isdigit():
        snake = f"_{snake}"
    return snake[:BQ_COLUMN_MAX_LENGTH]


def normalize_headers(headers: list) -> list[str]:
    used, out = set(RESERVED), []
    for i, h in enumerate(headers, start=1):
        base = name = bq_column_name(h, i)
        n = 2
        while name in used:
            name = f"{base}_{n}"
            n += 1
        used.add(name)
        out.append(name)
    return out


def deposit_source(blob_name: str) -> str | None:
    """Source of a deposit (<source>/<file>.csv), None for any other object of the bucket."""
    if blob_name.endswith("/") or "/" not in blob_name or not blob_name.lower().endswith(".csv"):
        return None
    source = blob_name.split("/", 1)[0]
    return source if re.match(r"^[a-z0-9_]+$", source) else None


def read_header(blob: storage.Blob) -> list[str]:
    with blob.open("r", encoding="utf-8-sig") as f:
        return next(csv.reader(io.StringIO(f.readline()), delimiter=";"))


def load_deposit(project_id: str, dataset_id: str, bucket_name: str, blob_name: str, source: str) -> dict:
    bq = client("bigquery")
    blob = client("storage").bucket(bucket_name).blob(blob_name)
    columns = normalize_headers(read_header(blob))
    depot_id = f"{source}-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:6]}"
    target = f"{project_id}.{dataset_id}.{source}"
    temp = f"{project_id}.{dataset_id}._tmp_{source}_{uuid.uuid4().hex[:8]}"

    job_config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.CSV, skip_leading_rows=1, field_delimiter=";", allow_quoted_newlines=True,
        allow_jagged_rows=True, encoding="UTF-8", schema=[bigquery.SchemaField(c, "STRING") for c in columns],
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )
    bq.load_table_from_uri(f"gs://{bucket_name}/{blob_name}", temp, job_config=job_config).result()
    try:
        table = bigquery.Table(target, schema=[bigquery.SchemaField(c, "STRING") for c in columns] + [
            bigquery.SchemaField("depot_id", "STRING"), bigquery.SchemaField("load_dts", "TIMESTAMP")])
        table.time_partitioning = bigquery.TimePartitioning(type_=bigquery.TimePartitioningType.DAY, field="load_dts")
        table = bq.create_table(table, exists_ok=True)
        existing = {f.name for f in table.schema}
        new = [c for c in columns if c not in existing]
        if new:
            table.schema = list(table.schema) + [bigquery.SchemaField(c, "STRING") for c in new]
            bq.update_table(table, ["schema"])
        cols = ", ".join(f"`{c}`" for c in columns)
        job = bq.query(
            f"INSERT INTO `{target}` ({cols}, depot_id, load_dts) SELECT {cols}, @depot_id, CURRENT_TIMESTAMP() FROM `{temp}`",
            job_config=bigquery.QueryJobConfig(query_parameters=[bigquery.ScalarQueryParameter("depot_id", "STRING", depot_id)]),
        )
        job.result()
        rows = job.num_dml_affected_rows
    finally:
        bq.delete_table(temp, not_found_ok=True)
    print(f"Deposit {depot_id}: {rows} rows appended to {target} ({len(new)} new columns)")
    return {"source": source, "depot_id": depot_id, "rows": rows, "file": blob_name}


def start_workflow(workflow: str, argument: dict) -> str:
    execution = client("workflows").create_execution(
        parent=workflow, execution=executions_v1.Execution(argument=json.dumps(argument)))
    print(f"Workflow started: {execution.name}")
    return execution.name


@app.post("/")
def gcs_to_bq():
    """Eventarc delivers each event once (retry_policy max_attempts = 1): an error is logged and returned as a 500."""
    event = from_http(request.headers, request.get_data())
    data = event.data if isinstance(event.data, dict) else json.loads(event.data)
    blob_name = data["name"]
    source = deposit_source(blob_name)
    if source is None:
        print(f"Ignored: {blob_name}")
        return {"ignored": blob_name}
    result = load_deposit(os.environ["BQ_PROJECT_ID"], os.environ["BQ_DATASET_ID"], data["bucket"], blob_name, source)
    if os.environ.get("WORKFLOW_NAME"):
        result["execution"] = start_workflow(os.environ["WORKFLOW_NAME"], {"source": source, "depot_id": result["depot_id"]})
    print(json.dumps(result, ensure_ascii=False))
    return result


@app.get("/healthz")
def healthz():
    return {"ok": True}
