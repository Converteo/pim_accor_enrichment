import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9_]+$")


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"Missing required environment variable {name}")
    return value


def _optional_int(name: str) -> int | None:
    value = os.environ.get(name, "").strip()
    return int(value) if value else None


def _optional_datetime(name: str) -> datetime | None:
    """ISO 8601 date-time (UTC when no offset is given), None when empty."""
    value = os.environ.get(name, "").strip()
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def identifier(value: str, name: str) -> str:
    """Used in table names and document ids."""
    if not _IDENTIFIER_RE.match(value):
        raise ValueError(f"{name}={value!r} must only contain letters, digits and underscores")
    return value


@dataclass(frozen=True)
class Settings:
    # Set per job by Cloud Build
    project_id: str
    raw_dataset: str          # project.dataset
    matching_dataset: str
    validation_dataset: str
    enhanced_dataset: str
    prompts_bucket: str
    output_bucket: str
    vertex_location: str
    gemini_model: str
    thinking_level: str | None
    firestore_database: str
    firestore_collection: str
    pim_api_secret: str       # projects/<p>/secrets/<s>/versions/latest
    scope_status: tuple[str, ...]

    # Tuning
    judge_threshold_high: int
    judge_threshold_low: int
    judge_batch_size: int
    enrich_batch_size: int
    enrich_auto_validate_score: int | None
    llm_concurrency: int
    max_output_tokens: int
    lease_seconds: int
    nb_hotels: int

    # Set per execution by the workflow
    family: str | None
    priorities: tuple[str, ...]
    deposited_at: datetime | None  # deposit that started the run: the PIM is extracted unless it was after it
    force: bool
    triggered_by: str | None  # e-mail of the reviewer who started the export from the interface (backend)

    run_id: str

    def table(self, dataset: str, name: str) -> str:
        return f"{getattr(self, dataset + '_dataset')}.{name}"

    @classmethod
    def from_env(cls) -> "Settings":
        family = os.environ.get("FAMILY", "").strip() or None
        return cls(
            project_id=_required("PROJECT_ID"),
            raw_dataset=_required("BQ_RAW_DATASET"),
            matching_dataset=_required("BQ_MATCHING_DATASET"),
            validation_dataset=_required("BQ_VALIDATION_DATASET"),
            enhanced_dataset=_required("BQ_ENHANCED_DATASET"),
            prompts_bucket=os.environ.get("GCS_PROMPTS_BUCKET", ""),
            output_bucket=os.environ.get("GCS_OUTPUT_BUCKET", ""),
            vertex_location=os.environ.get("VERTEX_LOCATION", "eu"),
            gemini_model=os.environ.get("GEMINI_MODEL", "gemini-3.8-flash"),
            thinking_level=os.environ.get("THINKING_LEVEL", "LOW").strip() or None,
            firestore_database=os.environ.get("FIRESTORE_DATABASE", "(default)"),
            firestore_collection=os.environ.get("FIRESTORE_COLLECTION", "pipeline_runs"),
            pim_api_secret=os.environ.get("PIM_API_SECRET", ""),
            scope_status=tuple(s.strip() for s in os.environ.get("SCOPE_STATUS", "Open,Pre-opening").split(",") if s.strip()),
            judge_threshold_high=int(os.environ.get("JUDGE_THRESHOLD_HIGH", "80")),
            judge_threshold_low=int(os.environ.get("JUDGE_THRESHOLD_LOW", "30")),
            judge_batch_size=int(os.environ.get("JUDGE_BATCH_SIZE", "50")),
            enrich_batch_size=int(os.environ.get("ENRICH_BATCH_SIZE", "20")),
            enrich_auto_validate_score=_optional_int("ENRICH_AUTO_VALIDATE_SCORE"),
            llm_concurrency=int(os.environ.get("LLM_CONCURRENCY", "4")),
            max_output_tokens=int(os.environ.get("MAX_OUTPUT_TOKENS", "32768")),
            lease_seconds=int(os.environ.get("LEASE_SECONDS", "3600")),
            nb_hotels=int(os.environ.get("NB_HOTELS", "1000")),
            family=identifier(family, "FAMILY") if family else None,
            priorities=tuple(p.strip() for p in os.environ.get("PRIORITIES", "P1,P2,P3").split(",") if p.strip()),
            deposited_at=_optional_datetime("DEPOSITED_AT"),
            force=os.environ.get("FORCE", "").lower() in ("1", "true", "yes"),
            triggered_by=os.environ.get("TRIGGERED_BY", "").strip() or None,
            run_id=os.environ.get("CLOUD_RUN_EXECUTION") or uuid.uuid4().hex,
        )
