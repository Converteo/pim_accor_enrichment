"""Small BigQuery helpers shared by the steps."""

import json
from datetime import date, datetime
from pathlib import Path

from google.cloud import bigquery

SCHEMAS_DIR = Path(__file__).parent / "schemas"


def schema(name: str) -> list[bigquery.SchemaField]:
    """Schemas are versioned in src/schemas/<table>.json; Terraform creates the tables from the same files."""
    return [bigquery.SchemaField.from_api_repr(f) for f in json.loads((SCHEMAS_DIR / f"{name}.json").read_text())]


def rows(client: bigquery.Client, sql: str, params: dict | None = None) -> list[dict]:
    job_config = bigquery.QueryJobConfig(query_parameters=[_param(k, v) for k, v in (params or {}).items()])
    return [dict(r.items()) for r in client.query(sql, job_config=job_config).result()]


def _param(name: str, value):
    if isinstance(value, (list, tuple)):
        return bigquery.ArrayQueryParameter(name, "STRING", list(value))
    if isinstance(value, bool):
        return bigquery.ScalarQueryParameter(name, "BOOL", value)
    if isinstance(value, int):
        return bigquery.ScalarQueryParameter(name, "INT64", value)
    if isinstance(value, datetime):
        return bigquery.ScalarQueryParameter(name, "TIMESTAMP", value)
    return bigquery.ScalarQueryParameter(name, "STRING", value)


def serialisable(row: dict) -> dict:
    return {k: v.isoformat() if isinstance(v, (datetime, date)) else v for k, v in row.items()}


def load(client: bigquery.Client, table_id: str, data: list[dict], fields: list[bigquery.SchemaField],
         truncate: bool = False) -> int:
    """Load job, not streaming: rows are visible at once to the next step's anti-join."""
    if not data and not truncate:
        return 0
    job_config = bigquery.LoadJobConfig(
        schema=fields,
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE if truncate else bigquery.WriteDisposition.WRITE_APPEND,
    )
    job = client.load_table_from_json([serialisable(r) for r in data], table_id, job_config=job_config)
    job.result()
    return job.output_rows or 0
