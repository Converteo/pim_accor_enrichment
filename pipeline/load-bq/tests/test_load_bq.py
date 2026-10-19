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
