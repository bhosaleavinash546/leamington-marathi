"""Data-protection endpoints (CLAUDE.md 10).

"explicit consent, stated purpose, encryption at rest, export and delete
endpoints, retention policy, and no third-party analytics on the birth-input
screens."

Consent, export and erasure are here; encryption and retention live in
:mod:`api.storage`. The last item is a frontend obligation and is recorded in
:data:`ANALYTICS_POLICY` so the API states it too rather than leaving it to a
README nobody reads.

Note what is **not** stored: nothing derived. A record holds the birth input and
the engine version, so an export returns exactly what the subject supplied, and
recomputation is always fresh (CLAUDE.md 2.2).
"""

from __future__ import annotations

from typing import Annotated, Any, Final, Literal

from fastapi import APIRouter, Body, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field

from api.deps import engine_metadata, utc_now
from api.locale import load_glossary
from api.schemas import BirthInput
from api.storage import (
    CONSENT_NOTICE_VERSION,
    DEFAULT_RETENTION_DAYS,
    PURPOSES,
    BirthRepository,
    StorageError,
)

router = APIRouter(prefix="/v1/privacy", tags=["privacy"])

#: Stated in the policy endpoint. CLAUDE.md 10 forbids third-party analytics on
#: the birth-input screens; the API declares it so a frontend cannot claim it was
#: unaware.
ANALYTICS_POLICY: Final[str] = (
    "No third-party analytics, tag managers, session recorders or advertising "
    "pixels are permitted on any screen that collects or displays birth input. "
    "Birth date, time, place and name together are sensitive personal data."
)

_repository: BirthRepository | None = None


def get_repository() -> BirthRepository:
    """Lazily construct the repository.

    Lazy so that importing the app does not require a database or an encryption
    key: every computed endpoint works without storage, and only these routes need
    it.
    """
    global _repository
    if _repository is None:
        _repository = BirthRepository()
    return _repository


def set_repository(repository: BirthRepository | None) -> None:
    """Inject a repository. Used by tests to supply a throwaway database."""
    global _repository
    _repository = repository


class StoreRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject_ref: Annotated[str, Field(min_length=1, max_length=128)]
    birth: BirthInput
    #: At least one. Storing without a stated purpose is refused.
    purposes: Annotated[list[str], Field(min_length=1)]
    #: Must match the notice the client displayed, so consent is to a known text.
    notice_version: str = CONSENT_NOTICE_VERSION
    consent_given: Literal[True]


class StoreResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    record_id: str
    expires_utc: str
    purposes: list[str]
    notice_version: str


class PolicyResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    notice_version: str
    retention_days: int
    purposes: list[str]
    analytics_policy: str
    encryption_at_rest: str
    stored_fields: list[str]
    not_stored: list[str]
    rights: dict[str, str]
    notice_text: dict[str, str]


@router.get("/policy", response_model=PolicyResponse)
def policy() -> PolicyResponse:
    """What is stored, why, for how long, and what the subject can do about it.

    Machine-readable so a client can render the consent notice from the same source
    of truth the server enforces, rather than from a hand-copied paragraph that can
    drift out of step with the code.
    """
    return PolicyResponse(
        notice_version=CONSENT_NOTICE_VERSION,
        retention_days=DEFAULT_RETENTION_DAYS,
        purposes=sorted(PURPOSES),
        analytics_policy=ANALYTICS_POLICY,
        encryption_at_rest=(
            "Name, date, time and place are encrypted together with Fernet "
            "(AES-128-CBC + HMAC) before storage. They are sensitive in "
            "combination, so nothing queryable is left in the clear."
        ),
        stored_fields=["name", "date", "time", "time_accuracy", "place", "engine_version"],
        not_stored=[
            "any computed longitude, tithi, dasha date, bala or koot score - "
            "derived values are never the source of truth and are always recomputed",
            "email addresses or other contact details",
            "IP addresses or device identifiers",
        ],
        rights={
            "access": "GET /v1/privacy/records?subject_ref=...",
            "erasure": "DELETE /v1/privacy/records/{record_id}",
            "erasure_all": "DELETE /v1/privacy/records?subject_ref=...",
            "withdraw_consent": "POST /v1/privacy/records/{record_id}/withdraw",
        },
        notice_text={
            locale: load_glossary(locale)["legal"]["data_consent"] for locale in ("mr", "hi", "en")
        },
    )


@router.post("/records", response_model=StoreResponse, status_code=status.HTTP_201_CREATED)
def store_record(request: Annotated[StoreRequest, Body()]) -> StoreResponse:
    """Store a birth input with explicit consent for stated purposes.

    ``consent_given`` is typed ``Literal[True]``, so a request that omits it or
    sends ``false`` fails validation. Consent cannot be implied by the act of
    calling the endpoint.
    """
    if request.notice_version != CONSENT_NOTICE_VERSION:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=(
                f"consent was given to notice version {request.notice_version!r} but "
                f"the current notice is {CONSENT_NOTICE_VERSION!r}. Re-display the "
                "notice and collect consent again."
            ),
        )
    repository = get_repository()
    meta = engine_metadata()
    try:
        record_id = repository.store(
            subject_ref=request.subject_ref,
            # The *input* only, exactly as supplied.
            payload=request.birth.model_dump(mode="json"),
            engine_version=meta["engine_version"],
            schema_version=meta["chartfacts_schema_version"],
            purposes=tuple(request.purposes),
            now=utc_now(),
        )
    except StorageError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    stored = repository.get(record_id)
    assert stored is not None
    return StoreResponse(
        record_id=record_id,
        expires_utc=stored.expires_utc.isoformat(),
        purposes=list(request.purposes),
        notice_version=CONSENT_NOTICE_VERSION,
    )


@router.get("/records")
def export_records(
    subject_ref: Annotated[str, Query(min_length=1)],
) -> dict[str, Any]:
    """Everything held for a subject, decrypted. The access right.

    Returns the input and the consent history. There is nothing derived to return,
    which is the point of not storing derived values.
    """
    records = get_repository().export_subject(subject_ref)
    return {
        "subject_ref": subject_ref,
        "record_count": len(records),
        "records": [
            {
                "record_id": r.id,
                "birth_input": r.payload,
                "engine_version": r.engine_version,
                "chartfacts_schema_version": r.chartfacts_schema_version,
                "created_utc": r.created_utc.isoformat(),
                "expires_utc": r.expires_utc.isoformat(),
                "consents": list(r.consents),
            }
            for r in records
        ],
        "note": (
            "This export contains every field held. No computed value is stored; "
            "charts are recomputed from this input on each request."
        ),
    }


@router.delete("/records/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_record(record_id: str) -> Response:
    """Erase one record. Hard delete, cascading to its consent rows."""
    if not get_repository().delete_record(record_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="no such record")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/records")
def delete_subject(
    subject_ref: Annotated[str, Query(min_length=1)],
) -> dict[str, Any]:
    """Erase everything for a subject."""
    removed = get_repository().delete_subject(subject_ref)
    return {"subject_ref": subject_ref, "records_deleted": removed}


class WithdrawRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    purpose: str


@router.post("/records/{record_id}/withdraw")
def withdraw_consent(record_id: str, request: Annotated[WithdrawRequest, Body()]) -> dict[str, Any]:
    """Withdraw consent for one purpose.

    When the last active purpose is withdrawn the record is deleted outright:
    holding sensitive data for which no purpose has consent would be unlawful, so
    withdrawal has to have that consequence.
    """
    repository = get_repository()
    if not repository.withdraw_consent(record_id, request.purpose, now=utc_now()):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="no such record")
    remaining = repository.get(record_id)
    return {
        "record_id": record_id,
        "withdrawn_purpose": request.purpose,
        "record_deleted": remaining is None,
        "active_purposes": (
            [c["purpose"] for c in remaining.consents if c["active"]] if remaining else []
        ),
    }


@router.post("/purge")
def purge_expired() -> dict[str, Any]:
    """Delete records past their retention date.

    Exposed as an endpoint so a scheduler can call it. A retention policy that is
    only written down is not a retention policy.
    """
    removed = get_repository().purge_expired(now=utc_now())
    return {"records_purged": removed, "retention_days": DEFAULT_RETENTION_DAYS}
