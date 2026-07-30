"""Provider selection. The only place a concrete adapter is named.

Keeping construction here means the rest of ``core/`` depends on the
:class:`~core.ephemeris.adapter.Ephemeris` protocol alone, which is what makes
the Skyfield swap in CLAUDE.md 2.1 a one-file change.
"""

from __future__ import annotations

from core.ephemeris.adapter import Ephemeris, EphemerisError
from core.types import EngineOptions

_DEFAULT_PROVIDER = "swisseph"


def build_ephemeris(
    options: EngineOptions | None = None, *, provider: str = _DEFAULT_PROVIDER
) -> Ephemeris:
    """Construct the configured ephemeris provider."""
    opts = options or EngineOptions()
    if provider == "swisseph":
        from core.ephemeris.swisseph_adapter import SwissEphemerisAdapter

        return SwissEphemerisAdapter(
            ayanamsa=opts.ayanamsa,
            node_type=opts.node_type,
            includes_nutation=opts.ayanamsa_includes_nutation,
        )
    raise EphemerisError(f"unknown ephemeris provider {provider!r}")
