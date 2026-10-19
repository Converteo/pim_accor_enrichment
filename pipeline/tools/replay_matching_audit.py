"""Non-regression check of brick 1: replay the pipeline's matching rules on the audit files and compare with the
audit figures (4 913 RID OK, 765 à valider, 34 rejetés out of 5 712, verdict = least favourable of the sources),
less the 9 RIDs the audit validated by hand, which the pipeline leaves to the judge agent.

    python tools/replay_matching_audit.py "<...>/Documents de travail"

Reads PIM_extract/PIM_extract_hotels_all_en.csv (labels), PIM_extract_brut/Product.csv (country codes) and the
three scrapings, with their headers turned into the snake_case names the loader writes.
The audit covered every PIM status, so the replay does too.
"""

import csv
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "jobs" / "src"))

import matching_rules as mr  # noqa: E402
from matching import match_source  # noqa: E402
from sources import SOURCES  # noqa: E402

FILES = {
    "booking_equipements": "Scrapping_booking/resultats_equipements.csv",
    "booking_piscines": "Scrapping_booking/Piscine update mai 2025.csv",
    "expedia": "Scrapping_expedia/expedia.csv",
}
# The audit validated 9 RIDs by hand (same hotel, explained gap); the pipeline leaves them to the judge agent or the app
AUDIT_MANUAL = {"B4N2", "8590", "B664", "2372", "B8P2", "B681", "C3I2", "B4S3", "C0K1"}
EXPECTED = {mr.OK: 4913 - len(AUDIT_MANUAL), mr.TO_CHECK: 765 + len(AUDIT_MANUAL), mr.REJECTED: 34}


def snake(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name.strip()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", ascii_name.lower()).strip("_")


def read(path: Path) -> list[dict]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        header = [snake(h) for h in next(reader)]
        return [dict(zip(header, r)) for r in reader]


def main(work: Path) -> int:
    with open(work / "PIM_extract_brut" / "Product.csv", encoding="utf-8-sig", newline="") as f:
        codes = {mr.normalize_rid(r["ProductRid"]): r["ProductAddressCountry"] for r in csv.DictReader(f, delimiter=";")}
    hotels = {}
    with open(work / "PIM_extract" / "PIM_extract_hotels_all_en.csv", encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            rid = mr.normalize_rid(r["RID"])
            hotels[rid] = {"rid": rid, "entity_id": r.get("PIM_ENTITY_ID"), "name": r.get("Name"), "commercial_name": r.get("CommercialName"),
                           "brand": r.get("Brand"), "old_brand": r.get("OldBrand") or None, "rebranding_date": r.get("RebrandingDate"),
                           "city": r.get("AddressCity"), "country": r.get("AddressCountry"), "address": r.get("AddressLine1"),
                           "status": r.get("SalesStatus"), "country_code": codes.get(rid)}
    candidats = []
    for source, cfg in SOURCES.items():
        rows = []
        for r in read(work / FILES[source]):
            rows.append({k: (r.get(cfg[k]) if cfg.get(k) else None) for k in ("rid", "name", "city", "brand", "country", "url", "about")})
        c, a = match_source(source, cfg, rows, hotels, set(hotels), {"run_id": "replay", "computed_at": None})
        print(f"{source}: {len(c)} matched {dict(Counter(x['pre_verdict'] for x in c))}, {len(a)} RIDs not in the PIM")
        candidats += c

    worst = {}
    for c in candidats:
        v = c["pre_verdict"]
        if c["rid"] not in worst or mr.RANK[v] < mr.RANK[worst[c["rid"]]]:
            worst[c["rid"]] = v
    got = dict(Counter(worst.values()))
    print(f"RID: {len(worst)} -> {got} (expected: {EXPECTED}, the audit's 9 manual validations left to the agent)")
    manual_ok = all(worst.get(r) == mr.TO_CHECK for r in AUDIT_MANUAL)
    return 0 if got == EXPECTED and manual_ok else 1


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1])))
