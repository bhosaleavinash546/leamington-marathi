"""Persistence, encryption at rest, and the data-protection lifecycle.

CLAUDE.md 2.2: "Postgres + SQLAlchemy. Store **birth input + engine version**,
never store derived values as source of truth - always recompute."

CLAUDE.md 10: "birth date, time, place and name together are sensitive personal
data under India's DPDP Act and under GDPR ... explicit consent, stated purpose,
encryption at rest, export and delete endpoints, retention policy, and no
third-party analytics on the birth-input screens."

Three design consequences, each enforced by the schema rather than by convention:

**Nothing derived is stored.** The table holds the birth input and the engine
version, and there is no column for a longitude, a tithi or a dasha date. A
recomputation with a newer engine therefore cannot silently disagree with a cached
row, because there is no cached row to disagree with.

**The sensitive payload is encrypted as one blob.** Name, date, time and place are
sensitive *in combination* - a birth date alone is ordinary, a birth date with a
time and a place is identifying. So they are encrypted together into
``payload_encrypted`` rather than field by field, and nothing queryable is left in
the clear.

**Consent is a row, not a flag.** ``consent`` records the purpose and the version
of the notice agreed to, so a later change to the notice does not retroactively
claim agreement that was never given.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Final

from sqlalchemy import (
    DateTime,
    ForeignKey,
    LargeBinary,
    String,
    create_engine,
    delete,
    select,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship

#: Default retention. CLAUDE.md 10 requires a stated policy; this is it, and
#: :func:`purge_expired` enforces it rather than leaving it as prose in a notice.
DEFAULT_RETENTION_DAYS: Final[int] = 365

#: Version of the consent notice. Bump when the notice text or purpose changes;
#: existing rows keep the version they agreed to.
CONSENT_NOTICE_VERSION: Final[str] = "1.0.0"

#: The only purposes a record may be stored for. An open-ended purpose string
#: would defeat purpose limitation, so this is a closed set.
PURPOSES: Final[frozenset[str]] = frozenset(
    {
        "compute_and_display_chart",
        "email_report",
        "saved_for_later_retrieval",
    }
)


class StorageError(RuntimeError):
    """Misconfiguration, or an operation refused on data-protection grounds."""


class Base(DeclarativeBase):
    pass


class BirthRecord(Base):
    """A stored birth input. Never a stored chart."""

    __tablename__ = "birth_record"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    #: Opaque account/subject identifier supplied by the caller. Deliberately not
    #: an email: an email in a queryable column is itself personal data.
    subject_ref: Mapped[str] = mapped_column(String(128), index=True)

    #: Name + date + time + place, encrypted as one blob (see module docstring).
    payload_encrypted: Mapped[bytes] = mapped_column(LargeBinary)

    #: Engine version at the time of storage. Kept so a recomputation can be
    #: labelled when the engine has moved on (CLAUDE.md 2.2).
    engine_version: Mapped[str] = mapped_column(String(32))
    chartfacts_schema_version: Mapped[str] = mapped_column(String(32))

    created_utc: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    #: When retention expires. Computed on insert so the policy is data, not code.
    expires_utc: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), index=True)

    consents: Mapped[list[ConsentGrant]] = relationship(
        back_populates="record", cascade="all, delete-orphan", lazy="selectin"
    )


class ConsentGrant(Base):
    """One recorded act of consent, for one purpose."""

    __tablename__ = "consent_grant"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    record_id: Mapped[str] = mapped_column(
        ForeignKey("birth_record.id", ondelete="CASCADE"), index=True
    )
    purpose: Mapped[str] = mapped_column(String(64))
    notice_version: Mapped[str] = mapped_column(String(32))
    granted_utc: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    withdrawn_utc: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    record: Mapped[BirthRecord] = relationship(back_populates="consents")

    @property
    def is_active(self) -> bool:
        return self.withdrawn_utc is None


# ---------------------------------------------------------------------------
# Encryption at rest
# ---------------------------------------------------------------------------


class PayloadCipher:
    """Symmetric encryption of the sensitive payload.

    Fernet: AES-128-CBC with an HMAC, so a tampered ciphertext fails to decrypt
    rather than yielding altered birth data.

    The key comes from ``JYOTISH_ENCRYPTION_KEY`` and is never generated silently
    in production. A missing key is a hard error: falling back to plaintext would
    turn a configuration slip into a data-protection breach with no visible
    symptom. ``allow_ephemeral`` exists for tests, which want a throwaway key.
    """

    ENV_VAR: Final[str] = "JYOTISH_ENCRYPTION_KEY"

    def __init__(self, key: bytes | None = None, *, allow_ephemeral: bool = False) -> None:
        try:
            from cryptography.fernet import Fernet
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise StorageError(
                "the 'cryptography' package is required for encryption at rest (CLAUDE.md 10)"
            ) from exc

        resolved = key or (os.environ.get(self.ENV_VAR) or "").encode() or None
        if resolved is None:
            if not allow_ephemeral:
                raise StorageError(
                    f"{self.ENV_VAR} is not set. Birth data is sensitive personal "
                    "data under the DPDP Act and GDPR (CLAUDE.md 10) and is never "
                    "stored unencrypted. Generate a key with "
                    "PayloadCipher.generate_key()."
                )
            resolved = Fernet.generate_key()
        self._fernet = Fernet(resolved)

    @staticmethod
    def generate_key() -> bytes:
        from cryptography.fernet import Fernet

        return bytes(Fernet.generate_key())

    def encrypt(self, payload: dict[str, Any]) -> bytes:
        raw = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
        return bytes(self._fernet.encrypt(raw))

    def decrypt(self, blob: bytes) -> dict[str, Any]:
        try:
            raw = self._fernet.decrypt(blob)
        except Exception as exc:
            raise StorageError(
                "could not decrypt a stored payload: the key may have rotated"
            ) from exc
        decoded: dict[str, Any] = json.loads(raw.decode("utf-8"))
        return decoded


# ---------------------------------------------------------------------------
# Repository
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class StoredBirth:
    """A decrypted record, as the export endpoint returns it."""

    id: str
    subject_ref: str
    payload: dict[str, Any]
    engine_version: str
    chartfacts_schema_version: str
    created_utc: dt.datetime
    expires_utc: dt.datetime
    consents: tuple[dict[str, Any], ...]


class BirthRepository:
    """Storage operations, including the DPDP/GDPR lifecycle.

    Defaults to SQLite so the whole layer is testable without a running Postgres;
    ``DATABASE_URL`` points it at Postgres in deployment. SQLAlchemy makes that a
    URL change and nothing more.
    """

    def __init__(
        self,
        url: str | None = None,
        *,
        cipher: PayloadCipher | None = None,
        retention_days: int = DEFAULT_RETENTION_DAYS,
        echo: bool = False,
    ) -> None:
        self._url = url or os.environ.get("DATABASE_URL", "sqlite+pysqlite:///:memory:")
        # An in-memory SQLite database lives inside its connection, so the default
        # pool - which opens a fresh connection per session - would hand every
        # session an empty schema. StaticPool keeps the one connection. Postgres
        # needs no such treatment and uses the normal pool.
        kwargs: dict[str, Any] = {"echo": echo, "future": True}
        if ":memory:" in self._url:
            from sqlalchemy.pool import StaticPool

            kwargs["poolclass"] = StaticPool
            kwargs["connect_args"] = {"check_same_thread": False}
        self._engine = create_engine(self._url, **kwargs)
        self._cipher = cipher or PayloadCipher(allow_ephemeral=":memory:" in self._url)
        self._retention_days = retention_days
        Base.metadata.create_all(self._engine)

    @contextmanager
    def session(self) -> Iterator[Session]:
        with Session(self._engine, future=True) as session:
            yield session
            session.commit()

    # -- create ------------------------------------------------------------

    def store(
        self,
        *,
        subject_ref: str,
        payload: dict[str, Any],
        engine_version: str,
        schema_version: str,
        purposes: tuple[str, ...],
        now: dt.datetime | None = None,
    ) -> str:
        """Store a birth input with its consent grants. Returns the record id.

        Refuses without at least one valid purpose: storing sensitive data with no
        stated purpose is exactly what purpose limitation forbids, and a default
        purpose would be consent by omission.
        """
        if not purposes:
            raise StorageError(
                "at least one purpose is required. CLAUDE.md 10 requires explicit "
                "consent and a stated purpose before storing birth data."
            )
        unknown = set(purposes) - PURPOSES
        if unknown:
            raise StorageError(f"unknown purpose(s) {sorted(unknown)}; known: {sorted(PURPOSES)}")

        stamp = now or dt.datetime.now(dt.UTC)
        record_id = str(uuid.uuid4())
        record = BirthRecord(
            id=record_id,
            subject_ref=subject_ref,
            payload_encrypted=self._cipher.encrypt(payload),
            engine_version=engine_version,
            chartfacts_schema_version=schema_version,
            created_utc=stamp,
            expires_utc=stamp + dt.timedelta(days=self._retention_days),
        )
        record.consents = [
            ConsentGrant(
                id=str(uuid.uuid4()),
                record_id=record_id,
                purpose=purpose,
                notice_version=CONSENT_NOTICE_VERSION,
                granted_utc=stamp,
            )
            for purpose in purposes
        ]
        with self.session() as session:
            session.add(record)
        return record_id

    # -- read / export -----------------------------------------------------

    def get(self, record_id: str) -> StoredBirth | None:
        with self.session() as session:
            record = session.get(BirthRecord, record_id)
            return None if record is None else self._to_dto(record)

    def export_subject(self, subject_ref: str) -> tuple[StoredBirth, ...]:
        """Every record for a subject, decrypted. The GDPR/DPDP access right.

        Returns the *input* only. There is nothing derived to export, which is the
        point of not storing derived values.
        """
        with self.session() as session:
            rows = session.scalars(
                select(BirthRecord).where(BirthRecord.subject_ref == subject_ref)
            ).all()
            return tuple(self._to_dto(row) for row in rows)

    # -- delete ------------------------------------------------------------

    def delete_record(self, record_id: str) -> bool:
        """Hard delete. Returns False if there was nothing to delete.

        Hard, not soft: a soft delete leaves the ciphertext in place, and an
        erasure right that retains the data is not an erasure right. Consent rows
        cascade.
        """
        with self.session() as session:
            record = session.get(BirthRecord, record_id)
            if record is None:
                return False
            session.delete(record)
            return True

    def delete_subject(self, subject_ref: str) -> int:
        """Delete everything for a subject. Returns the number of records removed."""
        with self.session() as session:
            ids = session.scalars(
                select(BirthRecord.id).where(BirthRecord.subject_ref == subject_ref)
            ).all()
            if not ids:
                return 0
            session.execute(delete(BirthRecord).where(BirthRecord.id.in_(ids)))
            return len(ids)

    def withdraw_consent(
        self, record_id: str, purpose: str, *, now: dt.datetime | None = None
    ) -> bool:
        """Mark a consent grant withdrawn.

        When the last active grant is withdrawn the record is deleted outright:
        continuing to hold sensitive data for which no purpose has consent would be
        unlawful, so withdrawal has to have teeth.
        """
        stamp = now or dt.datetime.now(dt.UTC)
        with self.session() as session:
            record = session.get(BirthRecord, record_id)
            if record is None:
                return False
            for grant in record.consents:
                if grant.purpose == purpose and grant.is_active:
                    grant.withdrawn_utc = stamp
            if not any(g.is_active for g in record.consents):
                session.delete(record)
            return True

    def purge_expired(self, *, now: dt.datetime | None = None) -> int:
        """Delete records past their retention date. Returns the count.

        Intended to run on a schedule. A retention policy that is only written down
        is not a retention policy.
        """
        stamp = now or dt.datetime.now(dt.UTC)
        with self.session() as session:
            ids = session.scalars(
                select(BirthRecord.id).where(BirthRecord.expires_utc <= stamp)
            ).all()
            if not ids:
                return 0
            session.execute(delete(BirthRecord).where(BirthRecord.id.in_(ids)))
            return len(ids)

    # -- helpers -----------------------------------------------------------

    def _to_dto(self, record: BirthRecord) -> StoredBirth:
        return StoredBirth(
            id=record.id,
            subject_ref=record.subject_ref,
            payload=self._cipher.decrypt(record.payload_encrypted),
            engine_version=record.engine_version,
            chartfacts_schema_version=record.chartfacts_schema_version,
            created_utc=record.created_utc,
            expires_utc=record.expires_utc,
            consents=tuple(
                {
                    "purpose": grant.purpose,
                    "notice_version": grant.notice_version,
                    "granted_utc": grant.granted_utc.isoformat(),
                    "withdrawn_utc": (
                        grant.withdrawn_utc.isoformat() if grant.withdrawn_utc else None
                    ),
                    "active": grant.is_active,
                }
                for grant in record.consents
            ),
        )


def stored_column_names() -> frozenset[str]:
    """Every column name in the schema.

    Used by a test asserting that no derived quantity has acquired a column
    (CLAUDE.md 2.2). Adding ``sid_lon`` or ``tithi_index`` here would fail it.
    """
    return frozenset(
        column.name for table in Base.metadata.tables.values() for column in table.columns
    )
