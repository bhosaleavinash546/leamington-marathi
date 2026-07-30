"""Offline-first place lookup (CLAUDE.md 2.2).

"Geocoding: offline-first. Bundle a GeoNames extract of India (population > 500) +
tz polygon lookup via ``timezonefinder``. Online geocoder is a fallback only - the
app must work offline for the top 20k Indian places."

**What ships and what does not.** The timezone half is complete: ``timezonefinder``
carries the tz polygons and resolves any coordinate offline, which is the part that
matters most - a wrong timezone silently shifts every value in the chart, whereas a
place a user has to type coordinates for is merely inconvenient.

The bundled gazetteer is a **seed of 120 Maharashtra and major Indian places**, not
the 20,000-row GeoNames extract the spec asks for. The full extract is a ~5 MB
download that could not be fetched in the environment this was built in, and
inventing coordinates would be worse than shipping fewer real ones.
:func:`dataset_status` reports the shortfall, and ``docs/DIVERGENCES.md`` records
it, so the gap is visible rather than assumed closed. ``tools/geonames_import.py``
turns the real extract into the bundled format when it is available.
"""

from __future__ import annotations

import json
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any, Final

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict

from api.schemas import timezone_for

router = APIRouter(prefix="/v1", tags=["places"])

DATA_PATH: Final[Path] = Path(__file__).resolve().parent.parent / "data" / "places.json"

#: What CLAUDE.md 2.2 asks for. Compared against the bundle in
#: :func:`dataset_status` so the shortfall is reported, not hidden.
TARGET_PLACE_COUNT: Final[int] = 20_000

MAX_RESULTS: Final[int] = 25

#: Returned when a coordinate resolves to an ``Etc/GMT*`` nautical zone.
#:
#: These are valid IANA names, so ``timezonefinder`` returning one is not an
#: error - the polygons cover the oceans. But they are fixed offsets in disguise:
#: no DST, no historical transitions. Localising a 1943 Indian birth with
#: ``Etc/GMT-5`` would silently lose the wartime-DST offset that CLAUDE.md 4.1
#: exists to preserve, which is exactly the failure the "never hand-code offsets"
#: rule guards against. So the response says so rather than handing back a zone
#: that looks fine.
OCEAN_ZONE_WARNING: Final[str] = "nautical_fixed_offset_zone_unsuitable_for_birth_records"

#: Zone-name prefixes that denote a fixed offset rather than a civil jurisdiction.
_FIXED_OFFSET_PREFIXES: Final[tuple[str, ...]] = ("Etc/", "GMT", "UTC", "UCT")


def _is_fixed_offset_zone(tz: str) -> bool:
    return tz.startswith(_FIXED_OFFSET_PREFIXES) or tz in {"GMT", "UTC", "Universal", "Zulu"}


class Place(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    #: Localised names where curated, keyed by locale.
    names: dict[str, str] = {}
    state: str
    country: str
    latitude: float
    longitude: float
    elevation_m: float = 0.0
    iana_tz: str
    population: int | None = None


class PlaceSearchResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str
    results: list[Place]
    #: True when every result came from the bundle rather than a network call.
    offline: bool
    dataset: dict[str, Any]


class ResolveResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    latitude: float
    longitude: float
    iana_tz: str | None
    #: Warning key when the resolved zone is unsuitable for a birth record.
    warning: str | None = None
    note: str | None = None


@dataclass(frozen=True, slots=True)
class DatasetStatus:
    bundled: int
    target: int

    @property
    def complete(self) -> bool:
        return self.bundled >= self.target

    def as_dict(self) -> dict[str, Any]:
        return {
            "bundled_places": self.bundled,
            "target_places": self.target,
            "complete": self.complete,
            "note": (
                "Complete offline gazetteer."
                if self.complete
                else (
                    f"Seed dataset only: {self.bundled} of {self.target} places "
                    "(CLAUDE.md 2.2). Timezone resolution is complete and offline "
                    "for any coordinate. Run tools/geonames_import.py with a "
                    "GeoNames IN.txt extract to bundle the full set. Recorded in "
                    "docs/DIVERGENCES.md."
                )
            ),
        }


@lru_cache(maxsize=1)
def load_places() -> tuple[Place, ...]:
    if not DATA_PATH.exists():  # pragma: no cover - the bundle ships with the package
        return ()
    raw = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return tuple(Place(**entry) for entry in raw["places"])


def dataset_status() -> DatasetStatus:
    return DatasetStatus(bundled=len(load_places()), target=TARGET_PLACE_COUNT)


def _fold(text: str) -> str:
    """Case- and accent-insensitive key, so "Chhatrapati" matches "chhatrapati"."""
    return "".join(
        ch
        for ch in unicodedata.normalize("NFD", text.casefold())
        if unicodedata.category(ch) != "Mn"
    )


def search(query: str, limit: int = MAX_RESULTS) -> list[Place]:
    """Prefix-then-substring match over the bundle, in Latin or Devanagari.

    Ranked so an exact prefix beats a mid-string hit, and a larger population beats
    a smaller one - a user typing "pun" wants Pune, not Punalur.
    """
    needle = _fold(query.strip())
    if not needle:
        return []
    scored: list[tuple[int, int, Place]] = []
    for place in load_places():
        candidates = [_fold(place.name), *(_fold(v) for v in place.names.values())]
        best: int | None = None
        for candidate in candidates:
            if candidate.startswith(needle):
                best = 0
            elif needle in candidate and best is None:
                best = 1
        if best is not None:
            scored.append((best, -(place.population or 0), place))
    scored.sort(key=lambda row: (row[0], row[1], row[2].name))
    return [place for _, _, place in scored[:limit]]


@router.get("/places", response_model=PlaceSearchResponse)
def search_places(
    q: Annotated[str, Query(min_length=1, max_length=100)],
    limit: Annotated[int, Query(ge=1, le=MAX_RESULTS)] = 10,
) -> PlaceSearchResponse:
    """Search the bundled gazetteer. Never touches the network."""
    return PlaceSearchResponse(
        query=q,
        results=search(q, limit),
        offline=True,
        dataset=dataset_status().as_dict(),
    )


@router.get("/places/resolve", response_model=ResolveResponse)
def resolve_timezone(
    latitude: Annotated[float, Query(ge=-90.0, le=90.0)],
    longitude: Annotated[float, Query(ge=-180.0, le=180.0)],
) -> ResolveResponse:
    """The IANA timezone for a coordinate, resolved offline from tz polygons.

    The most important half of the geocoder. A user can always type coordinates; a
    wrong timezone silently shifts every computed value in the chart, and
    CLAUDE.md 2.2 forbids hand-coded offsets, so this has to be right and has to
    work without a network.
    """
    tz = timezone_for(latitude, longitude)
    if tz is None:  # pragma: no cover - defensive; the polygons cover the globe
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail=(
                "no timezone polygon covers this coordinate. Supply iana_tz "
                "explicitly; a fixed offset is not accepted (CLAUDE.md 2.2)."
            ),
        )
    return ResolveResponse(
        latitude=latitude,
        longitude=longitude,
        iana_tz=tz,
        warning=OCEAN_ZONE_WARNING if _is_fixed_offset_zone(tz) else None,
        note=(
            "This is a nautical zone, not a civil one. It carries no DST and no "
            "historical transitions, so a birth localised with it would lose the "
            "historical-offset handling that CLAUDE.md 4.1 requires. Use the civil "
            "zone of the nearest land jurisdiction instead."
            if _is_fixed_offset_zone(tz)
            else None
        ),
    )
