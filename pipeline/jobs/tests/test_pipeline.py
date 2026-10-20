import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import enrichment_core as core  # noqa: E402
import matching_rules as mr  # noqa: E402
from decisions import AUTO_APPROVED, AUTO_REJECTED, NEEDS_REVIEW, VALUE_AUTO_APPROVED, confidence, enrichment_status, match_status  # noqa: E402
from export import flat_files  # noqa: E402
from prompts import assemble  # noqa: E402
from schemas_llm import EnrichResponse, HotelEnrichi, NonTraitee, Valeur  # noqa: E402

PAU = {"rid": "0952", "name": "MERCURE PAU PALAIS SPORTS", "commercial_name": "Mercure Pau Palais des Sports", "city": "Pau",
       "brand": "Mercure", "old_brand": None, "country": "France", "country_code": "FR", "entity_id": "101"}


# ------------------------------------------------------------------ brick 1: matching rules

def test_normalize_rid_restores_leading_zeros():
    assert mr.normalize_rid("952") == "0952"
    assert mr.normalize_rid(" c0b0 ") == "C0B0"
    assert mr.normalize_rid(None) == ""


def test_identity_ok_when_names_differ_but_words_match():
    out = mr.identity_check(PAU, {"name": "PAU PALAIS DES SPORTS", "city": "PAU", "brand": "Mercure", "country": "France"})
    assert out["verdict"] == mr.OK and out["reason"] is None


def test_identity_label_gap_names_the_gaps():
    out = mr.identity_check(PAU, {"name": "Hotel Lyon Part-Dieu", "city": "Lyon", "brand": "Mercure", "country": "France"})
    assert out["verdict"] == mr.TO_CHECK
    assert out["reason"].startswith(mr.REASON_LABEL_GAP) and "nom" in out["reason"] and "ville" in out["reason"]


def test_identity_known_rebranding_explains_brand_gap():
    hotel = {**PAU, "brand": "Pullman", "old_brand": "Mercure"}
    out = mr.identity_check(hotel, {"name": "Mercure Pau Palais des Sports", "city": "Pau", "brand": "Mercure", "country": "France"})
    assert out["verdict"] == mr.OK and out["rebranding"]


def test_booking_page_in_another_country_is_rejected():
    key, cc, found = mr.booking_page("https://www.booking.com/hotel/au/mercure-pau-palais-sports.html?aid=1")
    assert (key, cc, found) == ("/hotel/au/mercure-pau-palais-sports", "AU", "mercure pau palais sports")
    assert mr.page_check(PAU, found, cc)["verdict"] == mr.REJECTED


def test_page_with_old_brand_in_url_is_to_check_with_cause():
    out = mr.page_check(PAU, "etap hotel bordeaux", "FR")
    assert out["verdict"] == mr.TO_CHECK and out["reason"] == "Ancienne enseigne dans l'URL"


def test_unreadable_page_is_to_check():
    assert mr.page_check(PAU, None, None)["reason"] == mr.REASON_UNREADABLE


def test_shared_page_kept_by_best_match_only():
    rows = [
        {"rid": "A", "page_key": "/hotel/br/novotel-porto-alegre", "page_verdict": mr.OK, "page_reason": None, "page_rank": 2.0},
        {"rid": "B", "page_key": "/hotel/br/novotel-porto-alegre", "page_verdict": mr.OK, "page_reason": None, "page_rank": 1.2},
    ]
    mr.resolve_shared_pages(rows)
    assert rows[0]["page_verdict"] == mr.OK and rows[0]["shared_with"] == "B"
    assert rows[1]["page_verdict"] == mr.REJECTED and rows[1]["page_reason"] == mr.REASON_OTHER_HOTEL


def test_shared_page_tie_is_to_check():
    rows = [{"rid": r, "page_key": "/p", "page_verdict": mr.OK, "page_reason": None, "page_rank": 1.5} for r in "AB"]
    mr.resolve_shared_pages(rows)
    assert {r["page_reason"] for r in rows} == {mr.REASON_SHARED}


def test_combine_keeps_least_favourable():
    assert mr.combine(mr.OK, None, mr.REJECTED, "x") == (mr.REJECTED, "x")
    assert mr.combine(mr.TO_CHECK, "gap", mr.OK, None) == (mr.TO_CHECK, "gap")
    assert mr.combine(mr.OK, None, None, None) == (mr.OK, None)


# ------------------------------------------------------------------ brick 2: passing rule

@pytest.mark.parametrize("pre, reason, verdict, score, expected", [
    (mr.OK, None, "same_hotel", 95, AUTO_APPROVED),
    (mr.TO_CHECK, "gap", "same_hotel", 80, AUTO_APPROVED),
    (mr.REJECTED, mr.REASON_OTHER_HOTEL, "same_hotel", 95, NEEDS_REVIEW),   # a blocking indicator never auto-approves
    (mr.OK, None, "undetermined", 90, NEEDS_REVIEW),
    (mr.OK, None, "same_hotel", 60, NEEDS_REVIEW),
    (mr.OK, None, "different_hotel", 10, AUTO_REJECTED),
    (mr.REJECTED, mr.REASON_OTHER_COUNTRY, "same_hotel", 99, AUTO_REJECTED),  # another country is always rejected
])
def test_match_status(pre, reason, verdict, score, expected):
    assert match_status(pre, reason, verdict, score, high=80, low=30) == expected


def test_confidence_and_auto_approval_off_by_default():
    assert [confidence(s) for s in (95, 60, 10)] == ["high", "medium", "low"]
    assert enrichment_status("proposed", 99, None, None) == "proposed"
    assert enrichment_status("proposed", 95, None, 90) == VALUE_AUTO_APPROVED
    assert enrichment_status("proposed", 95, "doute", 90) == "proposed"


# ------------------------------------------------------------------ brick 3: enrichment

FIELDS = {
    "ProductCheckIn": {"pim_field": "ProductCheckIn", "entity": "Product", "pim_type": "String", "format": "hh:mm", "priority": "P2", "label": "Check in"},
    "ProductStaffLanguages": {"pim_field": "ProductStaffLanguages", "entity": "Product", "pim_type": "CVL", "cvl_id": "SpokenLanguages",
                              "multivalue": True, "priority": "P2", "label": "Languages"},
    "ProductFnBAvailableBar": {"pim_field": "ProductFnBAvailableBar", "entity": "Product", "pim_type": "Boolean", "priority": "P3", "label": "Bar"},
    "ParkingCharged": {"pim_field": "ParkingCharged", "entity": "Parking", "pim_type": "Boolean", "false_is_an_answer": True,
                       "priority": "P1", "label": "Parking charged"},
    "PoolType": {"pim_field": "PoolType", "entity": "Pool", "pim_type": "CVL", "cvl_id": "PoolType", "multivalue": False, "priority": "P2", "label": "Type"},
}
ALLOWED = {"SpokenLanguages": {"EN", "FR", "DE"}, "PoolType": {"Indoor", "Outdoor"}}
HOTEL = {"rid": "0952", "pim_entity_id": "101", "validated_sources": "booking_equipements",
         "sources": {"booking_equipements": {"check_in": "From 15:00", "parking": "[Free private parking is possible on site.]",
                                             "languages_spoken": "English ; French ; German", "piscine_1": "outdoor, Heated pool"}}}
CONTEXT = {"run_id": "r", "batch_id": "L", "family": "test", "source_hash": "h", "llm_model": "m", "prompt_version": "v", "enriched_at": None}


def test_targets_empty_fields_lists_and_entities():
    product = {"ProductCheckIn": None, "ProductStaffLanguages": "EN", "ProductFnBAvailableBar": "False"}
    entities = {"Parking": [{"entity_id": "p1", "ParkingCharged": None}, {"entity_id": "p2", "ParkingCharged": "False"}]}
    targets = core.targets_for_hotel(list(FIELDS.values()), product, entities)
    keys = {(t["pim_field"], t["entity_id"]) for t in targets}
    assert ("ProductCheckIn", None) in keys
    assert ("ProductStaffLanguages", None) in keys              # multi-value list: always completed
    assert ("ProductFnBAvailableBar", None) in keys             # FALSE is the default of a presence boolean
    assert ("ParkingCharged", "p1") in keys and ("ParkingCharged", "p2") not in keys   # FALSE = free is an answer
    assert ("PoolType", core.NEW_ENTITY) in keys                # no pool in the PIM: one can be created


@pytest.mark.parametrize("field, value, expected", [
    ("ProductCheckIn", "9:00", ("09:00", None)),
    ("ProductCheckIn", "3 PM", (None, "format HH:MM attendu : '3 PM'")),
    ("ProductFnBAvailableBar", "TRUE", ("True", None)),
    ("ProductStaffLanguages", "FR | DE", ("FR|DE", None)),
    ("ProductStaffLanguages", "FR|XX", (None, "hors de la liste PIM : XX")),
    ("PoolType", "Indoor|Outdoor", (None, "une seule valeur attendue")),
])
def test_check_value(field, value, expected):
    assert core.check_value(FIELDS[field], value, ALLOWED.get(FIELDS[field].get("cvl_id") or "", set())) == expected


def test_never_overwrite_the_pim():
    assert core.compare_with_pim(FIELDS["ProductCheckIn"], "15:00", None)[0] == "proposed"
    assert core.compare_with_pim(FIELDS["ProductCheckIn"], "15:00", "15:00")[0] == "matches_pim"
    assert core.compare_with_pim(FIELDS["ProductCheckIn"], "15:00", "14:00")[0] == "conflict"
    assert core.compare_with_pim(FIELDS["ProductStaffLanguages"], "EN|FR", "EN")[:2] == ("proposed", "FR")


def test_extract_found():
    assert core.extract_found("Free private parking", "[Free private parking is possible on site.]")
    assert core.extract_found("From 15:00 ... ", "From 15:00")
    assert not core.extract_found("Paid parking", "[Free private parking is possible on site.]")
    spa = "[Spa lounge/relaxation area, Hammam, Hot tub/Jacuzzi, Sauna, Massage]"
    assert core.extract_found("Spa lounge/relaxation area ; Hammam ; Hot tub/Jacuzzi ; Sauna", spa)
    assert not core.extract_found("Hammam ; Sauna ; Massage ; Steam room", spa)  # an invented 4th part is caught


def agent_value(field, entity_id, value, excerpt, source_field, score=95):
    """A value as the agent answers it (French keys)."""
    return Valeur(champ_pim=field, id_entite=entity_id, valeur=value, methode="extrait", source="booking_equipements",
                  champ_source=source_field, extrait_source=excerpt, score=score, alerte=None)


def test_rows_apply_value_to_all_entities_in_doubt_and_mark_missing():
    targets = [
        {"pim_field": "ParkingCharged", "entity": "Parking", "entity_id": "p1", "pim_value": None},
        {"pim_field": "ParkingCharged", "entity": "Parking", "entity_id": "p2", "pim_value": None},
        {"pim_field": "ProductCheckIn", "entity": "Product", "entity_id": None, "pim_value": None},
        {"pim_field": "ProductFnBAvailableBar", "entity": "Product", "entity_id": None, "pim_value": "False"},
    ]
    answer = HotelEnrichi(rid="0952", valeurs=[
        agent_value("ParkingCharged", "p1", "False", "Free private parking", "parking"),
        agent_value("ProductCheckIn", None, "15:00", "From 15:00", "check_in"),
    ])
    rows = core.rows_for_hotel(HOTEL, targets, answer, [], FIELDS, ALLOWED, {}, CONTEXT, None)
    by_key = {(r["pim_field"], r["entity_id"]): r for r in rows}
    assert by_key[("ParkingCharged", "p2")]["value"] == "False" and "dans le doute" in by_key[("ParkingCharged", "p2")]["warning"]
    assert by_key[("ProductCheckIn", None)]["status"] == "proposed" and by_key[("ProductCheckIn", None)]["excerpt_found"]
    assert by_key[("ProductFnBAvailableBar", None)]["status"] == "not_found"


def test_rows_cap_score_when_excerpt_not_found_and_number_new_entities():
    targets = [{"pim_field": "PoolType", "entity": "Pool", "entity_id": core.NEW_ENTITY, "pim_value": None}]
    answer = HotelEnrichi(rid="0952", valeurs=[
        agent_value("PoolType", "nouvelle_1", "Outdoor", "outdoor", "piscine_1"),
        agent_value("PoolType", "nouvelle_2", "Indoor", "indoor pool", "piscine_2", score=90),
    ])
    rows = core.rows_for_hotel(HOTEL, targets, answer, [], FIELDS, ALLOWED, {("PoolType", "Outdoor"): "Outdoor"}, CONTEXT, None)
    by_id = {r["entity_id"]: r for r in rows}
    assert set(by_id) == {"new_1", "new_2"}   # the agent's nouvelle_1, nouvelle_2
    assert by_id["new_1"]["score"] == 95 and by_id["new_1"]["value_label"] == "Outdoor"
    assert by_id["new_2"]["score"] == core.EXTRACT_CAP_SCORE and "introuvable" in by_id["new_2"]["warning"]


def test_value_without_excerpt_is_rejected_not_proposed():
    # Seen on the first dev run: "wheelchair accessible = False" proposed with no excerpt ("absent des sources")
    targets = [{"pim_field": "PoolType", "entity": "Pool", "entity_id": core.NEW_ENTITY, "pim_value": None}]
    answer = HotelEnrichi(rid="0952", valeurs=[agent_value("PoolType", "nouvelle_1", "Outdoor", "", "piscine_1")])
    rows = core.rows_for_hotel(HOTEL, targets, answer, [], FIELDS, ALLOWED, {}, CONTEXT, None)
    assert [(r["status"], r["reason"]) for r in rows] == [(core.DISCARDED, "pas d'extrait de la source")]


def test_rejected_value_and_skipped_reason():
    targets = [{"pim_field": "ProductStaffLanguages", "entity": "Product", "entity_id": None, "pim_value": "EN"},
               {"pim_field": "ProductCheckIn", "entity": "Product", "entity_id": None, "pim_value": None}]
    answer = HotelEnrichi(rid="0952", valeurs=[agent_value("ProductStaffLanguages", None, "XX", "German", "languages_spoken")])
    skipped = [NonTraitee(rid="0952", champ_pim="ProductCheckIn", id_entite=None, motif="absent des sources")]
    rows = {r["pim_field"]: r for r in core.rows_for_hotel(HOTEL, targets, answer, skipped, FIELDS, ALLOWED, {}, CONTEXT, None)}
    assert rows["ProductStaffLanguages"]["status"] == "discarded"
    assert rows["ProductCheckIn"]["reason"] == "absent des sources"


def test_payload_speaks_the_agent_language():
    targets = [{"pim_field": "PoolType", "entity": "Pool", "entity_id": core.NEW_ENTITY, "pim_value": None}]
    payload = core.hotel_payload("0952", targets, {}, {})
    assert payload["cibles"] == [{"champ_pim": "PoolType", "entite": "Pool", "id_entite": "nouvelle"}]


def test_response_schema_parses_agent_json():
    text = '{"hotels":[{"rid":"0952","valeurs":[]}],"non_traitees":[]}'
    assert EnrichResponse.model_validate_json(text).hotels[0].rid == "0952"


# ------------------------------------------------------------------ prompts and export

def test_assemble_puts_stable_blocks_first():
    assert assemble("common\n", "", "family") == "common\n\nfamily\n"


def test_prompts_tree_is_valid():
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
    from check_prompts import check
    assert check(Path(__file__).resolve().parents[2] / "prompts") == []


def test_flat_files_one_file_per_entity_type():
    values = [
        {"rid": "0952", "pim_entity_id": "101", "entity": "Product", "entity_id": None, "pim_field": "ProductCheckIn", "final_value": "15:00"},
        {"rid": "0952", "pim_entity_id": "101", "entity": "Pool", "entity_id": "new_1", "pim_field": "PoolType", "final_value": "Outdoor"},
    ]
    files = flat_files(values)
    assert set(files) == {"pim_product.csv", "pim_pool.csv", "traceability.csv"}
    assert files["pim_product.csv"].splitlines()[1] == "101;0952;15:00"
    assert "NEW-0952-new_1;101;0952;True;Outdoor" in files["pim_pool.csv"]


def test_enrichment_reads_only_sources_with_a_validated_match():
    from enrich import sources_to_read

    family = ["booking_equipements", "expedia"]
    # Only Booking deposited so far: Expedia has no raw table and must not be queried
    assert sources_to_read(family, {"0952": ["booking_equipements"], "1802": ["booking_equipements"]}) == ["booking_equipements"]
    assert sources_to_read(family, {"0952": ["expedia", "booking_equipements"]}) == family
    assert sources_to_read(family, {}) == []
