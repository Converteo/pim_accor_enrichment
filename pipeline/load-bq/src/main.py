"""Load a scraping deposit into its raw table, then start the enrichment workflow (Cloud Run service).

Eventarc posts here when a file lands in the OTA files bucket at <source>/<file>.csv (CSV, ";", UTF-8):
  1. headers turned into snake_case BigQuery names
  2. file loaded into a temporary table, every column as STRING
  3. rows appended to raw.<source> with the deposit id and the load timestamp; new columns are added on the fly,
     so a deposit with other or reordered columns still lands by column name
  4. workflow wf-enrichment started with {"source", "depot_id", "deposited_at"}
Each deposit is kept (no truncation), so two scrapings of the same source can be compared. The file stays in the
bucket (versioned). Other objects of the bucket (outside a <source>/ folder, or not CSV) are ignored.

A deposit is one version of an object: depot_id = <source>-<generation>, and the load job is named after it. Eventarc
delivers at least once (the event comes again when the answer takes more than the 10 s ack deadline, e.g. on a cold
start): a second delivery of the same version finds its job already there and is skipped, with no rows and no workflow.
Overwriting the file, even with the same content, makes a new generation, so a new deposit.
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
from google.api_core.exceptions import Conflict
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


def deposit_id(source: str, generation) -> str:
    """One deposit = one version of the object."""
    return f"{source}-{generation}"


def load_job_id(depot_id: str) -> str:
    """BigQuery job ids are unique in the project: the second delivery of a deposit cannot load it again."""
    return "deposit_" + re.sub(r"[^A-Za-z0-9_-]", "_", depot_id)


def load_deposit(project_id: str, dataset_id: str, bucket_name: str, blob_name: str, source: str, generation) -> dict | None:
    """Rows appended to raw.<source>; None when this version of the file was already delivered."""
    bq = client("bigquery")
    blob = client("storage").bucket(bucket_name).blob(blob_name, generation=int(generation))
    depot_id = deposit_id(source, generation)
    columns = normalize_headers(read_header(blob))
    target = f"{project_id}.{dataset_id}.{source}"
    temp = f"{project_id}.{dataset_id}._tmp_{source}_{uuid.uuid4().hex[:8]}"

    job_config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.CSV, skip_leading_rows=1, field_delimiter=";", allow_quoted_newlines=True,
        allow_jagged_rows=True, encoding="UTF-8", schema=[bigquery.SchemaField(c, "STRING") for c in columns],
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )
    try:
        job = bq.load_table_from_uri(f"gs://{bucket_name}/{blob_name}", temp, job_config=job_config,
                                     job_id=load_job_id(depot_id))
    except Conflict:
        return None
    job.result()
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
    return {"source": source, "depot_id": depot_id, "rows": rows, "file": blob_name,
            "deposited_at": datetime.now(timezone.utc).isoformat()}


def start_workflow(workflow: str, argument: dict) -> str:
    execution = client("workflows").create_execution(
        parent=workflow, execution=executions_v1.Execution(argument=json.dumps(argument)))
    print(f"Workflow started: {execution.name}")
    return execution.name


@app.post("/")
def gcs_to_bq():
    """An error is logged and returned as a 500; Eventarc does not retry it (retry_policy max_attempts = 1)."""
    event = from_http(request.headers, request.get_data())
    data = event.data if isinstance(event.data, dict) else json.loads(event.data)
    blob_name = data["name"]
    source = deposit_source(blob_name)
    if source is None:
        print(f"Ignored: {blob_name}")
        return {"ignored": blob_name}
    result = load_deposit(os.environ["BQ_PROJECT_ID"], os.environ["BQ_DATASET_ID"], data["bucket"], blob_name, source,
                          data["generation"])
    if result is None:
        print(f"Already loaded: {blob_name}#{data['generation']}, event delivered again")
        return {"duplicate": deposit_id(source, data["generation"])}
    if os.environ.get("WORKFLOW_NAME"):
        # deposited_at: the workflow refreshes the PIM unless an extraction finished after this deposit
        result["execution"] = start_workflow(os.environ["WORKFLOW_NAME"], {
            "source": source, "depot_id": result["depot_id"], "deposited_at": result["deposited_at"]})
    print(json.dumps(result, ensure_ascii=False))
    return result


@app.get("/healthz")
def healthz():
    return {"ok": True}
