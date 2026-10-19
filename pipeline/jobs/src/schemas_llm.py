"""Answer contracts imposed on the two agents (Gemini response schemas: fields required, no defaults)."""

from typing import Literal

from pydantic import BaseModel, Field

MOTIFS_JUGE = Literal[
    "concordance", "rebranding", "nom_interne", "ancienne_enseigne", "homonyme_autre_pays",
    "hotel_voisin", "page_partagee", "page_illisible", "autre",
]


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
