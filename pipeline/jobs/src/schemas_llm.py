"""Answer contracts imposed on the two agents (Gemini response schemas: fields required, no defaults).

The agents' prompts are written in French, so what they read and answer keeps French keys and codes. The code
translates the codes below when it writes the BigQuery tables, which are in English.
"""

from typing import Literal

from pydantic import BaseModel, Field

MOTIFS_JUGE = Literal[
    "concordance", "rebranding", "nom_interne", "ancienne_enseigne", "homonyme_autre_pays",
    "hotel_voisin", "page_partagee", "page_illisible", "autre",
]

# Agent code -> table code
VERDICTS = {"meme_hotel": "same_hotel", "autre_hotel": "different_hotel", "indetermine": "undetermined"}
JUDGE_REASONS = {
    "concordance": "consistent", "rebranding": "rebranding", "nom_interne": "internal_name",
    "ancienne_enseigne": "former_brand", "homonyme_autre_pays": "namesake_other_country",
    "hotel_voisin": "neighbouring_hotel", "page_partagee": "shared_page", "page_illisible": "unreadable_page",
    "autre": "other",
}
METHODS = {"extrait": "extracted", "converti": "converted", "deduit": "inferred"}
AGENT_NEW_ENTITY = "nouvelle"  # id the agent reads and gives for an entity to create (nouvelle, nouvelle_1, nouvelle_2...)


class Jugement(BaseModel):
    rid: str
    source: str
    verdict: Literal["meme_hotel", "autre_hotel", "indetermine"]
    score: int = Field(ge=0, le=100)
    motif: MOTIFS_JUGE
    justification: str


class JudgeResponse(BaseModel):
    jugements: list[Jugement]


class Valeur(BaseModel):
    champ_pim: str
    id_entite: str | None
    valeur: str
    methode: Literal["extrait", "converti", "deduit"]
    source: str
    champ_source: str | None
    extrait_source: str | None
    score: int = Field(ge=0, le=100)
    alerte: str | None


class HotelEnrichi(BaseModel):
    rid: str
    valeurs: list[Valeur]


class NonTraitee(BaseModel):
    rid: str
    champ_pim: str
    id_entite: str | None
    motif: str


class EnrichResponse(BaseModel):
    hotels: list[HotelEnrichi]
    non_traitees: list[NonTraitee]
