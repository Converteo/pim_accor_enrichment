import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import enrichment_core as core  # noqa: E402
import matching_rules as mr  # noqa: E402
from decisions import A_VALIDER, REJETE_AUTO, VALIDE_AUTO, VALIDEE_AUTO, enrichment_status, match_status, niveau  # noqa: E402
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
    assert out["verdict"] == mr.OK and out["motif"] is None


def test_identity_label_gap_names_the_gaps():
    out = mr.identity_check(PAU, {"name": "Hotel Lyon Part-Dieu", "city": "Lyon", "brand": "Mercure", "country": "France"})
    assert out["verdict"] == mr.TO_CHECK
    assert out["motif"].startswith(mr.MOTIF_LABEL_GAP) and "nom" in out["motif"] and "ville" in out["motif"]


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
    assert out["verdict"] == mr.TO_CHECK and out["motif"] == "Ancienne enseigne dans l'URL"


def test_unreadable_page_is_to_check():
    assert mr.page_check(PAU, None, None)["motif"] == mr.MOTIF_UNREADABLE


def test_shared_page_kept_by_best_match_only():
    rows = [
        {"rid": "A", "page_key": "/hotel/br/novotel-porto-alegre", "page_verdict": mr.OK, "page_motif": None, "page_rank": 2.0},
        {"rid": "B", "page_key": "/hotel/br/novotel-porto-alegre", "page_verdict": mr.OK, "page_motif": None, "page_rank": 1.2},
    ]
    mr.resolve_shared_pages(rows)
    assert rows[0]["page_verdict"] == mr.OK and rows[0]["partagee_avec"] == "B"
    assert rows[1]["page_verdict"] == mr.REJECTED and rows[1]["page_motif"] == mr.MOTIF_OTHER_HOTEL


def test_shared_page_tie_is_to_check():
    rows = [{"rid": r, "page_key": "/p", "page_verdict": mr.OK, "page_motif": None, "page_rank": 1.5} for r in "AB"]
    mr.resolve_shared_pages(rows)
    assert {r["page_motif"] for r in rows} == {mr.MOTIF_SHARED}


def test_combine_keeps_least_favourable():
    assert mr.combine(mr.OK, None, mr.REJECTED, "x") == (mr.REJECTED, "x")
    assert mr.combine(mr.TO_CHECK, "gap", mr.OK, None) == (mr.TO_CHECK, "gap")
    assert mr.combine(mr.OK, None, None, None) == (mr.OK, None)


# ------------------------------------------------------------------ brick 2: passing rule

@pytest.mark.parametrize("pre, motif, verdict, score, expected", [
    (mr.OK, None, "meme_hotel", 95, VALIDE_AUTO),
    (mr.TO_CHECK, "gap", "meme_hotel", 80, VALIDE_AUTO),
    (mr.REJECTED, mr.MOTIF_OTHER_HOTEL, "meme_hotel", 95, A_VALIDER),   # a blocking indicator never auto-validates
    (mr.OK, None, "indetermine", 90, A_VALIDER),
    (mr.OK, None, "meme_hotel", 60, A_VALIDER),
    (mr.OK, None, "autre_hotel", 10, REJETE_AUTO),
    (mr.REJECTED, mr.MOTIF_OTHER_COUNTRY, "meme_hotel", 99, REJETE_AUTO),  # another country is always rejected
])
def test_match_status(pre, motif, verdict, score, expected):
    assert match_status(pre, motif, verdict, score, high=80, low=30) == expected


def test_niveau_and_auto_validation_off_by_default():
    assert [niveau(s) for s in (95, 60, 10)] == ["haut", "moyen", "bas"]
    assert enrichment_status("proposee", 99, None, None) == "proposee"
    assert enrichment_status("proposee", 95, None, 90) == VALIDEE_AUTO
    assert enrichment_status("proposee", 95, "doute", 90) == "proposee"


# ------------------------------------------------------------------ brick 3: enrichment

CHAMPS = {
    "ProductCheckIn": {"champ_pim": "ProductCheckIn", "entite": "Product", "type_pim": "String", "format": "hh:mm", "priorite": "P2", "libelle": "Check in"},
    "ProductStaffLanguages": {"champ_pim": "ProductStaffLanguages", "entite": "Product", "type_pim": "CVL", "cvl_id": "SpokenLanguages",
                              "multivalue": True, "priorite": "P2", "libelle": "Languages"},
    "ProductFnBAvailableBar": {"champ_pim": "ProductFnBAvailableBar", "entite": "Product", "type_pim": "Boolean", "priorite": "P3", "libelle": "Bar"},
    "ParkingCharged": {"champ_pim": "ParkingCharged", "entite": "Parking", "type_pim": "Boolean", "false_est_une_reponse": True,
                       "priorite": "P1", "libelle": "Parking charged"},
    "PoolType": {"champ_pim": "PoolType", "entite": "Pool", "type_pim": "CVL", "cvl_id": "PoolType", "multivalue": False, "priorite": "P2", "libelle": "Type"},
}
ALLOWED = {"SpokenLanguages": {"EN", "FR", "DE"}, "PoolType": {"Indoor", "Outdoor"}}
HOTEL = {"rid": "0952", "pim_entity_id": "101", "sources_validees": "booking_equipements",
         "sources": {"booking_equipements": {"check_in": "From 15:00", "parking": "[Free private parking is possible on site.]",
                                             "languages_spoken": "English ; French ; German", "piscine_1": "outdoor, Heated pool"}}}
CONTEXT = {"run_id": "r", "lot_id": "L", "famille": "test", "source_hash": "h", "llm_model": "m", "prompt_version": "v", "enriched_at": None}


def test_targets_empty_fields_lists_and_entities():
    product = {"ProductCheckIn": None, "ProductStaffLanguages": "EN", "ProductFnBAvailableBar": "False"}
    entities = {"Parking": [{"entity_id": "p1", "ParkingCharged": None}, {"entity_id": "p2", "ParkingCharged": "False"}]}
    targets = core.targets_for_hotel(list(CHAMPS.values()), product, entities)
    keys = {(t["champ_pim"], t["id_entite"]) for t in targets}
    assert ("ProductCheckIn", None) in keys
    assert ("ProductStaffLanguages", None) in keys              # multi-value list: always completed
    assert ("ProductFnBAvailableBar", None) in keys             # FALSE is the default of a presence boolean
    assert ("ParkingCharged", "p1") in keys and ("ParkingCharged", "p2") not in keys   # FALSE = free is an answer
    assert ("PoolType", core.NEW_ENTITY) in keys                # no pool in the PIM: one can be created


@pytest.mark.parametrize("champ, value, expected", [
    ("ProductCheckIn", "9:00", ("09:00", None)),
    ("ProductCheckIn", "3 PM", (None, "format HH:MM attendu : '3 PM'")),
    ("ProductFnBAvailableBar", "TRUE", ("True", None)),
    ("ProductStaffLanguages", "FR | DE", ("FR|DE", None)),
    ("ProductStaffLanguages", "FR|XX", (None, "hors de la liste PIM : XX")),
    ("PoolType", "Indoor|Outdoor", (None, "une seule valeur attendue")),
])
def test_check_value(champ, value, expected):
    assert core.check_value(CHAMPS[champ], value, ALLOWED.get(CHAMPS[champ].get("cvl_id") or "", set())) == expected


def test_never_overwrite_the_pim():
    assert core.compare_with_pim(CHAMPS["ProductCheckIn"], "15:00", None)[0] == "proposee"
    assert core.compare_with_pim(CHAMPS["ProductCheckIn"], "15:00", "15:00")[0] == "deja_renseignee"
    assert core.compare_with_pim(CHAMPS["ProductCheckIn"], "15:00", "14:00")[0] == "ecart"
    assert core.compare_with_pim(CHAMPS["ProductStaffLanguages"], "EN|FR", "EN")[:2] == ("proposee", "FR")


def test_extract_found():
    assert core.extract_found("Free private parking", "[Free private parking is possible on site.]")
    assert core.extract_found("From 15:00 ... ", "From 15:00")
    assert not core.extract_found("Paid parking", "[Free private parking is possible on site.]")


def valeur(champ, id_entite, value, extrait, champ_source, score=95):
    return Valeur(champ_pim=champ, id_entite=id_entite, valeur=value, methode="extrait", source="booking_equipements",
                  champ_source=champ_source, extrait_source=extrait, score=score, alerte=None)


def test_rows_apply_value_to_all_entities_in_doubt_and_mark_missing():
    targets = [
        {"champ_pim": "ParkingCharged", "entite": "Parking", "id_entite": "p1", "valeur_pim": None},
        {"champ_pim": "ParkingCharged", "entite": "Parking", "id_entite": "p2", "valeur_pim": None},
        {"champ_pim": "ProductCheckIn", "entite": "Product", "id_entite": None, "valeur_pim": None},
        {"champ_pim": "ProductFnBAvailableBar", "entite": "Product", "id_entite": None, "valeur_pim": "False"},
    ]
    answer = HotelEnrichi(rid="0952", valeurs=[
        valeur("ParkingCharged", "p1", "False", "Free private parking", "parking"),
        valeur("ProductCheckIn", None, "15:00", "From 15:00", "check_in"),
    ])
    rows = core.rows_for_hotel(HOTEL, targets, answer, [], CHAMPS, ALLOWED, {}, CONTEXT, None)
    by_key = {(r["champ_pim"], r["id_entite"]): r for r in rows}
    assert by_key[("ParkingCharged", "p2")]["valeur"] == "False" and "dans le doute" in by_key[("ParkingCharged", "p2")]["alerte"]
    assert by_key[("ProductCheckIn", None)]["statut"] == "proposee" and by_key[("ProductCheckIn", None)]["extrait_trouve"]
    assert by_key[("ProductFnBAvailableBar", None)]["statut"] == "non_traitee"


def test_rows_cap_score_when_excerpt_not_found_and_number_new_entities():
    targets = [{"champ_pim": "PoolType", "entite": "Pool", "id_entite": core.NEW_ENTITY, "valeur_pim": None}]
    answer = HotelEnrichi(rid="0952", valeurs=[
        valeur("PoolType", "nouvelle_1", "Outdoor", "outdoor", "piscine_1"),
        valeur("PoolType", "nouvelle_2", "Indoor", "indoor pool", "piscine_2", score=90),
    ])
    rows = core.rows_for_hotel(HOTEL, targets, answer, [], CHAMPS, ALLOWED, {("PoolType", "Outdoor"): "Outdoor"}, CONTEXT, None)
    by_id = {r["id_entite"]: r for r in rows}
    assert set(by_id) == {"nouvelle_1", "nouvelle_2"}
    assert by_id["nouvelle_1"]["score"] == 95 and by_id["nouvelle_1"]["libelle_valeur"] == "Outdoor"
    assert by_id["nouvelle_2"]["score"] == core.EXTRACT_CAP_SCORE and "introuvable" in by_id["nouvelle_2"]["alerte"]


def test_rejected_value_and_skipped_reason():
    targets = [{"champ_pim": "ProductStaffLanguages", "entite": "Product", "id_entite": None, "valeur_pim": "EN"},
               {"champ_pim": "ProductCheckIn", "entite": "Product", "id_entite": None, "valeur_pim": None}]
    answer = HotelEnrichi(rid="0952", valeurs=[valeur("ProductStaffLanguages", None, "XX", "German", "languages_spoken")])
    skipped = [NonTraitee(rid="0952", champ_pim="ProductCheckIn", id_entite=None, motif="absent des sources")]
    rows = {r["champ_pim"]: r for r in core.rows_for_hotel(HOTEL, targets, answer, skipped, CHAMPS, ALLOWED, {}, CONTEXT, None)}
    assert rows["ProductStaffLanguages"]["statut"] == "rejetee"
    assert rows["ProductCheckIn"]["motif"] == "absent des sources"


def test_response_schema_parses_agent_json():
    text = '{"hotels":[{"rid":"0952","valeurs":[]}],"non_traitees":[]}'
    assert EnrichResponse.model_validate_json(text).hotels[0].rid == "0952"


# ------------------------------------------------------------------ prompts and export

def test_assemble_puts_stable_blocks_first():
    assert assemble("commun\n", "", "famille") == "commun\n\nfamille\n"


def test_prompts_tree_is_valid():
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
    from check_prompts import check
    assert check(Path(__file__).resolve().parents[2] / "prompts") == []


def test_flat_files_one_file_per_entity_type():
    values = [
        {"rid": "0952", "pim_entity_id": "101", "entite": "Product", "id_entite": None, "champ_pim": "ProductCheckIn", "valeur_finale": "15:00"},
        {"rid": "0952", "pim_entity_id": "101", "entite": "Pool", "id_entite": "nouvelle_1", "champ_pim": "PoolType", "valeur_finale": "Outdoor"},
    ]
    files = flat_files(values)
    assert set(files) == {"pim_product.csv", "pim_pool.csv", "tracabilite.csv"}
    assert files["pim_product.csv"].splitlines()[1] == "101;0952;15:00"
    assert "NOUVELLE-0952-nouvelle_1;101;0952;True;Outdoor" in files["pim_pool.csv"]
