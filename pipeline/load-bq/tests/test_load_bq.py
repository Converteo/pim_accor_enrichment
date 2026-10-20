import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import main  # noqa: E402


def test_headers_are_bigquery_names_without_duplicates():
    assert main.normalize_headers(["﻿RID", "Hôtel", "Food & Drink", "rid", "", "2nd", "depot_id"]) == [
        "rid", "hotel", "food_drink", "rid_2", "colonne_5", "_2nd", "depot_id_2"]


def test_only_csv_in_a_source_folder_is_a_deposit():
    assert main.deposit_source("booking_equipements/resultats_equipements.csv") == "booking_equipements"
    assert main.deposit_source("expedia/2026-10/expedia.CSV") == "expedia"
    for name in ("expedia.csv", "expedia/", "expedia/hotels.xlsx", "Booking/x.csv"):
        assert main.deposit_source(name) is None


def test_healthz_and_ignored_object():
    c = main.app.test_client()
    assert c.get("/healthz").json == {"ok": True}
    headers = {"ce-id": "1", "ce-source": "//storage.googleapis.com/projects/_/buckets/b", "ce-specversion": "1.0",
               "ce-type": "google.cloud.storage.object.v1.finalized", "Content-Type": "application/json"}
    r = c.post("/", headers=headers, json={"bucket": "b", "name": "readme.txt"})
    assert r.status_code == 200 and r.json == {"ignored": "readme.txt"}


def test_one_deposit_per_version_of_the_file():
    assert main.deposit_id("expedia", "1792345678901234") == "expedia-1792345678901234"
    assert main.load_job_id("expedia-1792345678901234") == "deposit_expedia-1792345678901234"


def test_event_delivered_again_is_skipped(monkeypatch):
    from google.api_core.exceptions import Conflict

    class FakeBigQuery:
        def load_table_from_uri(self, uri, table, job_config, job_id):
            raise Conflict(f"Already Exists: Job {job_id}")

    class FakeStorage:
        def bucket(self, name):
            return self

        def blob(self, name, generation=None):
            return name

    started = []
    monkeypatch.setattr(main, "_clients", {"bigquery": FakeBigQuery(), "storage": FakeStorage()})
    monkeypatch.setattr(main, "read_header", lambda blob: ["RID", "HOTEL"])
    monkeypatch.setattr(main, "start_workflow", lambda *a: started.append(a))
    monkeypatch.setenv("BQ_PROJECT_ID", "p")
    monkeypatch.setenv("BQ_DATASET_ID", "d")
    monkeypatch.setenv("WORKFLOW_NAME", "wf")
    headers = {"ce-id": "2", "ce-source": "//storage.googleapis.com/projects/_/buckets/b", "ce-specversion": "1.0",
               "ce-type": "google.cloud.storage.object.v1.finalized", "Content-Type": "application/json"}
    r = main.app.test_client().post("/", headers=headers, json={"bucket": "b", "name": "expedia/expedia.csv", "generation": "17"})
    assert r.status_code == 200 and r.json == {"duplicate": "expedia-17"}
    assert started == []
