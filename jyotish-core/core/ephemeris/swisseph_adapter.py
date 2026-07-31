"""Swiss Ephemeris implementation of :class:`core.ephemeris.adapter.Ephemeris`.

**This is the only module in the repository permitted to import ``swisseph``.**
``tests/unit/test_adapter_boundary.py`` fails the build if that is violated.

Licensing (CLAUDE.md 2.1): pyswisseph is AGPL-3.0. The decision recorded in
``docs/DECISIONS.md`` is to ship v1 under AGPL. Swapping in a permissive
provider means writing a sibling of this file and nothing else.

Ephemeris data: no ``.se1`` files are bundled, so Swiss Ephemeris uses its
built-in Moshier analytical theory. That is deliberate - see
``docs/DECISIONS.md`` D7 for the accuracy argument (sub-arcsecond for the Moon,
which is ~0.5 s of tithi-boundary time, two orders below the one-minute golden
tolerance). Set ``JYOTISH_EPHE_PATH`` to a directory of ``.se1`` files to use
the JPL-derived files instead; the provider string changes accordingly so no
output can be mistaken for the other configuration.
"""

from __future__ import annotations

import datetime as dt
import os
import threading
from typing import Final

import swisseph as swe

from core.angles import norm360
from core.enums import Graha, NodeType
from core.ephemeris.adapter import (
    BodyPosition,
    ChartAngles,
    CircumpolarError,
    DiscConvention,
    EphemerisError,
    ProviderInfo,
    RiseSetEvent,
)
from core.timeutil import utc_from_jd

# ---------------------------------------------------------------------------
# Pinned constants (CLAUDE.md 4.5: ayanamsa flags are pinned, not looked up by
# fuzzy name, and a change is a breaking engine bump)
# ---------------------------------------------------------------------------

AYANAMSA_MODES: Final[dict[str, tuple[int, str]]] = {
    "lahiri": (swe.SIDM_LAHIRI, "SE_SIDM_LAHIRI"),
    "lahiri_1940": (swe.SIDM_LAHIRI_1940, "SE_SIDM_LAHIRI_1940"),
    "lahiri_icrc": (swe.SIDM_LAHIRI_ICRC, "SE_SIDM_LAHIRI_ICRC"),
    "true_chitra": (swe.SIDM_TRUE_CITRA, "SE_SIDM_TRUE_CITRA"),
    "raman": (swe.SIDM_RAMAN, "SE_SIDM_RAMAN"),
    "kp": (swe.SIDM_KRISHNAMURTI, "SE_SIDM_KRISHNAMURTI"),
    "suryasiddhanta": (swe.SIDM_SURYASIDDHANTA, "SE_SIDM_SURYASIDDHANTA"),
}

_SWE_BODY: Final[dict[Graha, int]] = {
    Graha.SUN: swe.SUN,
    Graha.MOON: swe.MOON,
    Graha.MARS: swe.MARS,
    Graha.MERCURY: swe.MERCURY,
    Graha.JUPITER: swe.JUPITER,
    Graha.VENUS: swe.VENUS,
    Graha.SATURN: swe.SATURN,
}

_RSMI: Final[dict[RiseSetEvent, int]] = {
    RiseSetEvent.RISE: swe.CALC_RISE,
    RiseSetEvent.SET: swe.CALC_SET,
    RiseSetEvent.UPPER_TRANSIT: swe.CALC_MTRANSIT,
    RiseSetEvent.LOWER_TRANSIT: swe.CALC_ITRANSIT,
}

_DISC_BITS: Final[dict[DiscConvention, int]] = {
    # Swiss Ephemeris default: upper limb, standard refraction. No extra bits.
    DiscConvention.UPPER_LIMB_REFRACTED: 0,
    DiscConvention.DISC_CENTRE_NO_REFRACTION: swe.BIT_DISC_CENTER | swe.BIT_NO_REFRACTION,
    DiscConvention.DISC_CENTRE_REFRACTED: swe.BIT_DISC_CENTER,
}

#: Standard atmosphere at the observer, passed to the refraction model. Real
#: pressure/temperature at birth is never known; these are the ICAO sea-level
#: values Swiss Ephemeris itself defaults to when given 0.
_ATMOS_PRESSURE_MBAR = 1013.25
_ATMOS_TEMP_C = 15.0

#: ``swe.set_sid_mode`` and ``swe.set_ephe_path`` are process-global. Serialise
#: every call that depends on them so that two adapters with different ayanamsas
#: cannot interleave.
_SWE_LOCK = threading.RLock()


class SwissEphemerisAdapter:
    """Concrete :class:`~core.ephemeris.adapter.Ephemeris`.

    Instances are cheap; construct one per chart computation.
    """

    def __init__(
        self,
        *,
        ayanamsa: str = "lahiri",
        node_type: NodeType = NodeType.TRUE,
        includes_nutation: bool = True,
        ephe_path: str | None = None,
    ) -> None:
        if ayanamsa not in AYANAMSA_MODES:
            raise EphemerisError(f"unknown ayanamsa {ayanamsa!r}; known: {sorted(AYANAMSA_MODES)}")
        self._ayanamsa = ayanamsa
        self._sid_mode, self._sid_const_name = AYANAMSA_MODES[ayanamsa]
        self._node_type = node_type
        self._includes_nutation = includes_nutation
        self._ephe_path = (
            ephe_path if ephe_path is not None else os.environ.get("JYOTISH_EPHE_PATH")
        )
        self._calc_flags = (swe.FLG_SWIEPH if self._ephe_path else swe.FLG_MOSEPH) | swe.FLG_SPEED
        self._provider = "swisseph_swieph" if self._ephe_path else "swisseph_moshier"
        # FLG_NONUT refers the ayanamsa to the mean equinox instead of the true one.
        self._ayanamsa_flags = self._calc_flags | (0 if includes_nutation else swe.FLG_NONUT)

    # -- configuration -----------------------------------------------------

    def _apply_globals(self) -> None:
        """Push this adapter's global state into the C library. Call under lock."""
        swe.set_ephe_path(self._ephe_path)
        swe.set_sid_mode(self._sid_mode, 0.0, 0.0)

    @property
    def info(self) -> ProviderInfo:
        return ProviderInfo(
            provider=self._provider,
            version=str(swe.version),
            ayanamsa=self._ayanamsa,
            ayanamsa_constant=self._sid_const_name,
            ayanamsa_includes_nutation=self._includes_nutation,
        )

    @property
    def node_type(self) -> NodeType:
        return self._node_type

    # -- longitudes --------------------------------------------------------

    def ayanamsa_deg(self, jd_ut: float) -> float:
        """Ayanamsa in degrees, referred to the configured equinox.

        Uses ``get_ayanamsa_ex_ut`` rather than the older ``get_ayanamsa_ut``: the
        latter always excludes nutation, which put this engine's own
        ``tropical - ayanamsa`` conversion 12.8 arcseconds away from the provider's
        internal ``FLG_SIDEREAL`` result. The cross-implementation test found that;
        see docs/DECISIONS.md D13.
        """
        with _SWE_LOCK:
            self._apply_globals()
            _retflags, value = swe.get_ayanamsa_ex_ut(jd_ut, self._ayanamsa_flags)
            return float(value)

    def position(self, body: Graha, jd_ut: float) -> BodyPosition:
        return self.positions((body,), jd_ut)[body]

    def positions(self, bodies: tuple[Graha, ...], jd_ut: float) -> dict[Graha, BodyPosition]:
        with _SWE_LOCK:
            self._apply_globals()
            ayanamsa = self._ayanamsa_locked(jd_ut)
            out: dict[Graha, BodyPosition] = {}
            node_needed = Graha.RAHU in bodies or Graha.KETU in bodies
            node_pos: BodyPosition | None = None
            if node_needed:
                node_pos = self._raw(self._node_swe_id(), Graha.RAHU, jd_ut, ayanamsa)
            for body in bodies:
                if body is Graha.RAHU:
                    assert node_pos is not None
                    out[body] = node_pos
                elif body is Graha.KETU:
                    assert node_pos is not None
                    out[body] = _opposite(node_pos, Graha.KETU)
                else:
                    out[body] = self._raw(_SWE_BODY[body], body, jd_ut, ayanamsa)
            return out

    def _node_swe_id(self) -> int:
        # The binding's module constants are untyped, so the cast happens here at
        # the provider boundary rather than leaking Any into core/.
        return int(swe.MEAN_NODE if self._node_type is NodeType.MEAN else swe.TRUE_NODE)

    def _raw(self, swe_id: int, body: Graha, jd_ut: float, ayanamsa: float) -> BodyPosition:
        """Call ``calc_ut`` and convert to sidereal. Assumes the lock is held."""
        try:
            values, _retflags = swe.calc_ut(jd_ut, swe_id, self._calc_flags)
        except swe.Error as exc:  # pragma: no cover - provider-level failure
            raise EphemerisError(f"swisseph failed for {body} at jd={jd_ut}: {exc}") from exc
        tropical = norm360(float(values[0]))
        return BodyPosition(
            body=body,
            tropical_lon=tropical,
            sidereal_lon=norm360(tropical - ayanamsa),
            latitude=float(values[1]),
            speed_lon=float(values[3]),
            distance_au=float(values[2]),
        )

    # -- angles ------------------------------------------------------------

    def angles(self, jd_ut: float, latitude: float, longitude: float) -> ChartAngles:
        with _SWE_LOCK:
            self._apply_globals()
            ayanamsa = self._ayanamsa_locked(jd_ut)
            # House system 'E' (equal from ascendant) is requested only because
            # some system must be named; only ascmc is used. Whole-sign and
            # Sripati cusps are derived in core/chart/houses.py, never taken
            # from the provider (CLAUDE.md 3.3 - no Placidus).
            _cusps, ascmc = swe.houses_ex(jd_ut, latitude, longitude, b"E", self._calc_flags)
            obliquity = self.obliquity_deg(jd_ut)
            return ChartAngles(
                ascendant_sid=norm360(float(ascmc[0]) - ayanamsa),
                mc_sid=norm360(float(ascmc[1]) - ayanamsa),
                armc=norm360(float(ascmc[2])),
                obliquity=obliquity,
            )

    def _ayanamsa_locked(self, jd_ut: float) -> float:
        """Ayanamsa without re-taking the lock. Callers must already hold it."""
        _retflags, value = swe.get_ayanamsa_ex_ut(jd_ut, self._ayanamsa_flags)
        return float(value)

    def obliquity_deg(self, jd_ut: float) -> float:
        with _SWE_LOCK:
            values, _flags = swe.calc_ut(jd_ut, swe.ECL_NUT, swe.FLG_SWIEPH)
            return float(values[0])

    # -- rise / set --------------------------------------------------------

    def rise_set(
        self,
        event: RiseSetEvent,
        body: Graha,
        jd_ut_search_from: float,
        latitude: float,
        longitude: float,
        elevation_m: float,
        convention: DiscConvention,
    ) -> dt.datetime:
        if body in (Graha.RAHU, Graha.KETU):
            raise EphemerisError("rise/set is undefined for the lunar nodes")
        rsmi = _RSMI[event] | _DISC_BITS[convention]
        with _SWE_LOCK:
            self._apply_globals()
            try:
                res, tret = swe.rise_trans(
                    jd_ut_search_from,
                    _SWE_BODY[body],
                    rsmi,
                    (longitude, latitude, elevation_m),
                    _ATMOS_PRESSURE_MBAR,
                    _ATMOS_TEMP_C,
                    self._calc_flags,
                )
            except swe.Error as exc:  # pragma: no cover
                raise EphemerisError(f"rise_trans failed: {exc}") from exc
        if res == -2:
            raise CircumpolarError(
                f"{body} {event} does not occur at lat={latitude} from jd={jd_ut_search_from}"
            )
        if res < 0:  # pragma: no cover - defensive
            raise EphemerisError(f"rise_trans returned {res}")
        return utc_from_jd(float(tret[0]))


def _opposite(pos: BodyPosition, body: Graha) -> BodyPosition:
    """Ketu: exactly 180 deg from Rahu, same speed, mirrored latitude.

    Derived rather than computed so the ``rahu - ketu == 180`` invariant in
    ``tests/invariants/`` holds by construction and cannot drift.
    """
    return BodyPosition(
        body=body,
        tropical_lon=norm360(pos.tropical_lon + 180.0),
        sidereal_lon=norm360(pos.sidereal_lon + 180.0),
        latitude=-pos.latitude,
        speed_lon=pos.speed_lon,
        distance_au=pos.distance_au,
    )
