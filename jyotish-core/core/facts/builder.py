"""Build the versioned ``ChartFacts`` document (CLAUDE.md 5).

This is the contract between the engine and everything above it. The narrative
layer sees **only this**, so three properties are load-bearing:

1. **Every ``key`` is a stable machine identifier.** No Devanagari, no English
   prose. Locale files map keys upward.
2. **Every number is final.** The LLM is told to treat them as immutable, and the
   §6 system prompt forbids recomputation - but the contract has to make that
   possible by carrying every figure the prose could need.
3. **Provenance travels with the data.** Ephemeris provider, ayanamsa constant,
   sunrise convention, dasha year length, applied UTC offset and ruleset are all
   in the document, because a number without its convention cannot be checked.

Time-unknown and time-approximate handling (CLAUDE.md 4.6) lives here too:
``confidence.affected_fields`` is produced by actually recomputing the chart at
the bounds of the stated window and diffing, not by guessing which fields are
sensitive.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Any

from core.chart.assemble import Chart, compute_chart, rotate_chart, varga_chart
from core.chart.dignity import is_in_exaltation_sign
from core.dasha.vimshottari import (
    CurrentDasha,
    VimshottariTimeline,
    build_timeline,
    periods_at_level,
)
from core.doshas.computed import DoshaFinding, SadeSati, kaal_sarpa, sade_sati
from core.enums import (
    SAPTA_GRAHA,
    Graha,
    Varga,
)
from core.ephemeris.adapter import Ephemeris
from core.ephemeris.registry import build_ephemeris
from core.name.namakaran import NamakaranCheck, check_namakaran
from core.name.numerology import NameNumerology, NumerologyReading, compute_numerology
from core.panchang.day import BirthMoment, PanchangDay, panchang_for_instant
from core.panchang.ishtakaal import compute_day_night_length
from core.rules.engine import RuleMatch, evaluate_rules, load_doshas, load_yogas
from core.timeutil import iso_utc, jd_from_utc, lmt_offset_seconds, to_utc
from core.types import ACCURACY_WINDOW_MINUTES, BirthData, InputError
from core.version import CHARTFACTS_SCHEMA_VERSION, ENGINE_VERSION

#: Fields recomputed at the window bounds to build ``confidence.affected_fields``.
#: Chosen because each is known to flip within an hour: the lagna moves a degree
#: every four minutes, the Moon a shashtiamsa every two, and the dasha balance
#: shifts by days per minute of birth-time error.
_CONFIDENCE_PROBES: tuple[str, ...] = (
    "chart.lagna.rashi",
    "chart.lagna.nakshatra",
    "chart.lagna.pada",
    "panchang.nakshatra_at_birth.pada",
    "panchang.tithi_at_birth.key",
    "dasha.current.maha",
    "dasha.current.antar",
    "chart.grahas.moon.house_whole_sign",
    "chart.grahas.moon.vargas.D60",
)

#: Vargas emitted in full. All sixteen are computed; the document carries the
#: ones a Marathi sheet or a standard report actually prints, plus every graha's
#: own varga rashi map, so nothing is lost.
_EMITTED_VARGA_CHARTS: tuple[Varga, ...] = (Varga.D9, Varga.D10, Varga.D30, Varga.D60)


@dataclass(frozen=True, slots=True)
class FullReading:
    """Everything the engine computed for one birth, before serialisation."""

    birth: BirthData
    birth_utc: dt.datetime | None
    applied_offset_seconds: int | None
    ephemeris: Ephemeris
    panchang: PanchangDay
    moment: BirthMoment | None
    chart: Chart | None
    timeline: VimshottariTimeline | None
    current_dasha: CurrentDasha | None
    yogas: tuple[RuleMatch, ...]
    doshas: tuple[RuleMatch, ...]
    kaal_sarpa: DoshaFinding | None
    sade_sati: SadeSati | None
    namakaran: NamakaranCheck | None
    numerology: NameNumerology
    affected_fields: tuple[str, ...]


def compute_full_reading(
    birth: BirthData, *, now: dt.datetime | None = None, eph: Ephemeris | None = None
) -> FullReading:
    """Run the whole deterministic engine for one birth input.

    ``now`` is the instant against which transit-dependent findings (Sade Sati)
    are evaluated. It is a parameter rather than a call to ``datetime.now()`` so
    that the engine is a pure function and its output is reproducible - a
    requirement for the narrative cache keyed on ChartFacts (CLAUDE.md 6).
    """
    ephemeris = eph or build_ephemeris(birth.options)
    reference = now or dt.datetime.now(dt.UTC)

    if birth.time is None:
        return _time_unknown_reading(birth, ephemeris, reference)

    birth_utc, offset = to_utc(
        dt.datetime.combine(birth.date, birth.time),
        iana_tz=birth.place.iana_tz,
        longitude_deg=birth.place.longitude,
        standard=birth.time_standard,
    )
    panchang, moment = panchang_for_instant(
        ephemeris, birth.date, birth_utc, birth.place, birth.options
    )
    chart = compute_chart(
        ephemeris, birth_utc, birth.place, panchang.lights, panchang.vara.index, birth.options
    )

    nakshatra = moment.nakshatra
    timeline = build_timeline(
        birth_utc,
        nakshatra.index,
        nakshatra.fraction_elapsed,
        birth.options.dasha_year_length,
    )

    return FullReading(
        birth=birth,
        birth_utc=birth_utc,
        applied_offset_seconds=offset,
        ephemeris=ephemeris,
        panchang=panchang,
        moment=moment,
        chart=chart,
        timeline=timeline,
        current_dasha=timeline.current(reference),
        yogas=evaluate_rules(load_yogas(), chart),
        doshas=evaluate_rules(load_doshas(), chart, ruleset=birth.options.mangal_dosha_ruleset),
        kaal_sarpa=kaal_sarpa(chart),
        sade_sati=sade_sati(ephemeris, chart, reference),
        namakaran=check_namakaran(birth.name, nakshatra.index, nakshatra.pada),
        numerology=compute_numerology(birth.name),
        affected_fields=_probe_time_window(birth, ephemeris, reference),
    )


def _time_unknown_reading(
    birth: BirthData, ephemeris: Ephemeris, reference: dt.datetime
) -> FullReading:
    """The degraded reading for an unknown birth time (CLAUDE.md 4.6).

    Lagna, houses, every Bhava-dependent yoga, all dasha dates and Ishtakaal are
    *absent*, not defaulted. The day's panchang is still computed - it is a
    property of the date and place, not of the clock time - and it is computed at
    that day's sunrise, which is the only defensible reference instant.
    """
    del reference  # nothing transit-dependent survives without a birth time
    from core.panchang.day import compute_panchang_day

    return FullReading(
        birth=birth,
        birth_utc=None,
        applied_offset_seconds=None,
        ephemeris=ephemeris,
        panchang=compute_panchang_day(ephemeris, birth.date, birth.place, birth.options),
        moment=None,
        chart=None,
        timeline=None,
        current_dasha=None,
        yogas=(),
        doshas=(),
        kaal_sarpa=None,
        sade_sati=None,
        namakaran=None,
        numerology=compute_numerology(birth.name),
        # Named as suppressed rather than as "changed": these are absent from the
        # document entirely, and the UI's confidence banner says so.
        affected_fields=SUPPRESSED_WITHOUT_BIRTH_TIME,
    )


#: Field paths omitted from ChartFacts when the birth time is unknown
#: (CLAUDE.md 4.6). Listed explicitly so the UI banner can enumerate them
#: without inferring anything from missing keys.
SUPPRESSED_WITHOUT_BIRTH_TIME: tuple[str, ...] = (
    "chart.lagna",
    "chart.grahas.*.house_whole_sign",
    "chart.grahas.*.house_chalit",
    "chart.bhava_chalit",
    "chart.vargas",
    "dasha",
    "panchang.ishtakaal",
    "panchang.tithi_at_birth",
    "yogas_present",
    "doshas",
)


#: Sampling step, in minutes, for the time-window probe.
#:
#: Chosen from the *fastest* probe field, not from the window width. Sampling only
#: the endpoints aliases: the ascendant advances one pada (3 deg 20') in roughly
#: 13 minutes at Indian latitudes, so a one-hour window can return to the same
#: pada at -60, 0 and +60 minutes and be wrongly reported as stable. The Moon's
#: D60 division turns over about every 22 minutes.
#:
#: 4 minutes gives at least three samples per pada cycle, comfortably inside the
#: Nyquist limit for the quantities being watched.
_PROBE_STEP_MINUTES: int = 4

#: Hard cap on samples, so a future wider accuracy band cannot make this
#: quadratic. At 4-minute steps a one-hour window needs 31 samples.
_PROBE_MAX_SAMPLES: int = 41


def _probe_time_window(
    birth: BirthData, ephemeris: Ephemeris, reference: dt.datetime
) -> tuple[str, ...]:
    """Recompute across the window and report which probe fields change.

    CLAUDE.md 4.6: "If ``time_accuracy != exact``, run the chart at the bounds of
    the stated window and **flag every field that changes**." Actually running it
    is the only honest way to answer - the set of sensitive fields depends on
    where in a sign or nakshatra the birth happens to fall, not on the width of
    the window alone.

    The chart is recomputed at every sample point, which for a one-hour window is
    31 full charts. That cost is paid only for a non-exact birth time, and it is
    the price of an honest answer: a cheaper endpoint-only probe silently
    under-reports (see :data:`_PROBE_STEP_MINUTES`).
    """
    window = ACCURACY_WINDOW_MINUTES[birth.time_accuracy]
    if window == 0 or birth.time is None:
        return ()

    offsets = _probe_offsets(window)
    centre = dt.datetime.combine(birth.date, birth.time)
    samples: list[dict[str, Any]] = []
    for delta in offsets:
        shifted = centre + dt.timedelta(minutes=delta)
        try:
            samples.append(_probe_values(birth, shifted, ephemeris, reference))
        except (InputError, ValueError):  # pragma: no cover - bound crossed midnight
            continue

    if len(samples) < 2:  # pragma: no cover
        return ()
    changed = [field for field in _CONFIDENCE_PROBES if len({s.get(field) for s in samples}) > 1]
    return tuple(changed)


def _probe_offsets(window_minutes: int) -> tuple[int, ...]:
    """Sample offsets across ``[-window, +window]``, always including both bounds."""
    step = _PROBE_STEP_MINUTES
    count = 2 * window_minutes // step + 1
    if count > _PROBE_MAX_SAMPLES:  # pragma: no cover - no shipped band is this wide
        step = 2 * window_minutes // (_PROBE_MAX_SAMPLES - 1)
    offsets = list(range(-window_minutes, window_minutes + 1, step))
    if offsets[-1] != window_minutes:
        offsets.append(window_minutes)
    return tuple(offsets)


def _probe_values(
    birth: BirthData, local_naive: dt.datetime, ephemeris: Ephemeris, reference: dt.datetime
) -> dict[str, Any]:
    """Evaluate just the probe fields at one candidate instant."""
    birth_utc, _ = to_utc(
        local_naive,
        iana_tz=birth.place.iana_tz,
        longitude_deg=birth.place.longitude,
        standard=birth.time_standard,
    )
    panchang, moment = panchang_for_instant(
        ephemeris, local_naive.date(), birth_utc, birth.place, birth.options
    )
    chart = compute_chart(
        ephemeris, birth_utc, birth.place, panchang.lights, panchang.vara.index, birth.options
    )
    timeline = build_timeline(
        birth_utc,
        moment.nakshatra.index,
        moment.nakshatra.fraction_elapsed,
        birth.options.dasha_year_length,
    )
    current = timeline.current(reference, depth=2)
    return {
        "chart.lagna.rashi": chart.lagna.rashi,
        "chart.lagna.nakshatra": chart.lagna.nakshatra,
        "chart.lagna.pada": chart.lagna.pada,
        "panchang.nakshatra_at_birth.pada": moment.nakshatra.pada,
        "panchang.tithi_at_birth.key": moment.tithi.key,
        "dasha.current.maha": current.periods[0].lord.value,
        "dasha.current.antar": (
            current.periods[1].lord.value if len(current.periods) > 1 else None
        ),
        "chart.grahas.moon.house_whole_sign": chart.grahas[Graha.MOON].house_whole_sign,
        "chart.grahas.moon.vargas.D60": chart.grahas[Graha.MOON].vargas[Varga.D60],
    }


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------


def build_chart_facts(reading: FullReading) -> dict[str, Any]:
    """Serialise a :class:`FullReading` into the ChartFacts JSON document."""
    birth = reading.birth
    info = reading.ephemeris.info

    facts: dict[str, Any] = {
        "schema_version": CHARTFACTS_SCHEMA_VERSION,
        "engine_version": ENGINE_VERSION,
        "ephemeris": {
            "provider": info.provider,
            "version": info.version,
            "ayanamsa": info.ayanamsa,
            "ayanamsa_constant": info.ayanamsa_constant,
            # The ayanamsa depends only on the epoch, so it is well defined even
            # when there is no chart (an unknown birth time, CLAUDE.md 4.6). It is
            # then taken at that day's sunrise. Reporting 0.0 would be a wrong
            # number rather than an absent one, and CLAUDE.md 4.5 requires the value
            # actually in force to be recorded in output metadata.
            "ayanamsa_value_deg": round(_ayanamsa_deg(reading), 6),
            "ayanamsa_includes_nutation": info.ayanamsa_includes_nutation,
            "node_type": birth.options.node_type.value,
            "rise_set_convention": reading.panchang.disc_convention.value,
        },
        "authority": "date_panchang",
        "input": _input_block(reading),
        "confidence": {
            "birth_time": birth.time_accuracy.value,
            "affected_fields": list(reading.affected_fields),
            "warnings": list(birth.warnings),
        },
        "panchang": _panchang_block(reading),
        "name": _name_block(reading),
    }

    if reading.chart is not None:
        facts["chart"] = _chart_block(reading.chart)
        facts["yogas_present"] = [_match_block(m) for m in reading.yogas]
        facts["doshas"] = _dosha_blocks(reading)
    if reading.timeline is not None and reading.current_dasha is not None:
        facts["dasha"] = _dasha_block(reading.timeline, reading.current_dasha)
    return facts


def _ayanamsa_deg(reading: FullReading) -> float:
    """The ayanamsa in force, whether or not a chart could be computed."""
    if reading.chart is not None:
        return reading.chart.ayanamsa_deg
    return reading.ephemeris.ayanamsa_deg(jd_from_utc(reading.panchang.lights.sunrise))


def _input_block(reading: FullReading) -> dict[str, Any]:
    birth = reading.birth
    return {
        "name": birth.name,
        "date": birth.date.isoformat(),
        "time": birth.time.isoformat() if birth.time else None,
        "time_accuracy": birth.time_accuracy.value,
        "time_standard": birth.time_standard.value,
        "place": {
            "name": birth.place.name,
            "latitude": birth.place.latitude,
            "longitude": birth.place.longitude,
            "elevation_m": birth.place.elevation_m,
            "iana_tz": birth.place.iana_tz,
        },
        "gender": birth.gender.value if birth.gender else None,
        "calendar_variant": birth.options.calendar_variant.value,
        # The offset actually applied, not the zone's current offset - the whole
        # point of CLAUDE.md 4.1.
        "resolved_utc_offset_seconds": reading.applied_offset_seconds,
        # The local-mean-time offset for this longitude, reported beside the one
        # actually applied. For a pre-1955 Indian birth the two are the competing
        # readings of the same recorded clock time, and the reader is entitled to
        # see the size of the doubt rather than only that it exists (audit F-004).
        "lmt_utc_offset_seconds": lmt_offset_seconds(birth.place.longitude),
        "birth_utc": iso_utc(reading.birth_utc),
    }


def _day_night_block(day: PanchangDay) -> dict[str, Any]:
    """दिनमान and रात्रीमान in ghati-pala, with minutes alongside."""
    length = compute_day_night_length(day.lights)
    return {
        "dinamana": {
            "ghati": length.dinamana_ghati,
            "pala": length.dinamana_pala,
            "minutes": round(length.dinamana_minutes, 3),
        },
        "ratrimana": {
            "ghati": length.ratrimana_ghati,
            "pala": length.ratrimana_pala,
            "minutes": round(length.ratrimana_minutes, 3),
        },
    }


def _panchang_block(reading: FullReading) -> dict[str, Any]:
    day = reading.panchang
    hd = day.hindu_date
    block: dict[str, Any] = {
        "hindu_civil_date": day.hindu_civil_date.isoformat(),
        # दिनमान and रात्रीमान. A Marathi sheet prints both beside sunrise and
        # sunset; night runs to the *next* sunrise, not to midnight (audit F-012).
        "day_night_length": _day_night_block(day),
        "hindu_date": {
            "shaka_year": hd.shaka_year,
            "month_key": hd.month_key,
            "month_display_key": day.lunar_month.display_key,
            "month_anomaly": hd.month_anomaly.value,
            "suppressed_month_key": hd.suppressed_month_key,
            "paksha": hd.paksha.value,
            "tithi_index": hd.tithi_index,
            "calendar_variant": hd.variant.value,
        },
        "vara": {"key": day.vara.key, "index": day.vara.index, "lord": day.vara.lord.value},
        "tithi_at_sunrise": _limb(day.tithi_at_sunrise),
        "nakshatra_at_sunrise": _nakshatra(day.nakshatra_at_sunrise),
        "yoga_at_sunrise": _limb(day.yoga_at_sunrise),
        "karana_at_sunrise": _limb(day.karana_at_sunrise),
        "tithi_anomaly": day.tithi_anomaly.value,
        "anomalous_tithi": _limb(day.anomalous_tithi) if day.anomalous_tithi else None,
        "sunrise_utc": iso_utc(day.lights.sunrise),
        "sunset_utc": iso_utc(day.lights.sunset),
        "next_sunrise_utc": iso_utc(day.lights.next_sunrise),
        "moonrise_utc": iso_utc(day.lights.moonrise),
        "moonset_utc": iso_utc(day.lights.moonset),
        "rahu_kaal": _interval(day.periods.rahu_kaal),
        "gulika_kaal": _interval(day.periods.gulika_kaal),
        "yamaganda": _interval(day.periods.yamaganda),
        "abhijit_muhurta": _interval(day.periods.abhijit_muhurta),
        "ritu": {"key": day.solar.ritu_key, "convention": day.solar.ritu_convention.value},
        "ayana": day.solar.ayana.value,
        "sun_rashi": day.solar.rashi,
        "sankrantis_in_month": [
            {"rashi": s.rashi, "when_utc": iso_utc(s.when_utc)} for s in day.lunar_month.sankrantis
        ],
    }
    if reading.moment is not None:
        moment = reading.moment
        block["tithi_at_birth"] = _limb(moment.tithi)
        block["nakshatra_at_birth"] = _nakshatra(moment.nakshatra)
        block["yoga_at_birth"] = _limb(moment.yoga)
        block["karana_at_birth"] = _limb(moment.karana)
        block["tithi_at_birth_differs_from_sunrise"] = moment.differs_from_sunrise
        block["ishtakaal"] = {
            "ghati": moment.ishtakaal.ghati,
            "pala": moment.ishtakaal.pala,
            "vipala": moment.ishtakaal.vipala,
            "convention": moment.ishtakaal.convention.value,
        }
    return block


def _limb(limb: Any) -> dict[str, Any]:
    out = {
        "key": limb.key,
        "index": limb.index,
        "start_utc": iso_utc(limb.start_utc),
        "end_utc": iso_utc(limb.end_utc),
    }
    if hasattr(limb, "paksha"):
        out["paksha"] = limb.paksha.value
        out["number_in_paksha"] = limb.number_in_paksha
    return out


def _nakshatra(state: Any) -> dict[str, Any]:
    return {
        "key": state.key,
        "index": state.index,
        "pada": state.pada,
        "lord": state.lord.value,
        "fraction_elapsed": round(state.fraction_elapsed, 9),
        "start_utc": iso_utc(state.start_utc),
        "end_utc": iso_utc(state.end_utc),
    }


def _interval(interval: Any) -> dict[str, Any]:
    return {"start_utc": iso_utc(interval.start), "end_utc": iso_utc(interval.end)}


def _chart_block(chart: Chart) -> dict[str, Any]:
    return {
        "lagna": {
            "sid_lon": round(chart.lagna.sid_lon, 6),
            "rashi": chart.lagna.rashi,
            "rashi_key": chart.lagna.rashi_key,
            "deg_in_rashi": round(chart.lagna.deg_in_rashi, 6),
            "nakshatra": chart.lagna.nakshatra,
            "nakshatra_key": chart.lagna.nakshatra_key,
            "pada": chart.lagna.pada,
        },
        "mc_sid_lon": round(chart.mc_sid, 6),
        "house_system": {"primary": "whole_sign", "secondary": "sripati"},
        "bhava_chalit": {
            "madhyas": [round(v, 6) for v in chart.chalit.madhyas],
            "sandhis": [round(v, 6) for v in chart.chalit.sandhis],
        },
        "chandra_lagna_rashi": chart.chandra_lagna_rashi,
        "surya_lagna_rashi": chart.surya_lagna_rashi,
        "grahas": [_graha_block(chart, g) for g in Graha],
        "vargas": {
            varga.value: {
                "lagna_rashi": chart.varga_lagnas[varga],
                "houses": {g.value: h for g, h in varga_chart(chart, varga).items()},
            }
            for varga in _EMITTED_VARGA_CHARTS
        },
        "chandra_kundali_houses": {
            g.value: h for g, h in rotate_chart(chart, chart.chandra_lagna_rashi).items()
        },
        "surya_kundali_houses": {
            g.value: h for g, h in rotate_chart(chart, chart.surya_lagna_rashi).items()
        },
        "ashtakavarga": {
            "bhinna": {g.value: list(chart.ashtakavarga.bhinna[g]) for g in SAPTA_GRAHA},
            "sarva": list(chart.ashtakavarga.sarva),
            "sarva_total": chart.ashtakavarga.sav_total,
        },
    }


def _graha_block(chart: Chart, graha: Graha) -> dict[str, Any]:
    pos = chart.grahas[graha]
    block: dict[str, Any] = {
        "key": graha.value,
        "sid_lon": round(pos.point.sid_lon, 6),
        "rashi": pos.point.rashi,
        "rashi_key": pos.point.rashi_key,
        "deg_in_rashi": round(pos.point.deg_in_rashi, 6),
        "nakshatra": pos.point.nakshatra,
        "nakshatra_key": pos.point.nakshatra_key,
        "pada": pos.point.pada,
        "nakshatra_lord": pos.point.nakshatra_lord.value,
        "house_whole_sign": pos.house_whole_sign,
        "house_chalit": pos.house_chalit,
        "retrograde": pos.retrograde,
        "stationary": pos.stationary,
        "combust": pos.combust,
        "dignity": pos.dignity.value,
        # Reported beside the label because the two overlap: a Moon at
        # Vrishabha 15 deg is labelled moolatrikona and is also in its
        # exaltation sign (docs/DECISIONS.md D19).
        "in_exaltation_sign": is_in_exaltation_sign(pos.graha, pos.point.sid_lon),
        "speed_lon_deg_per_day": round(pos.speed_lon, 8),
        "vargas": {v.value: r for v, r in pos.vargas.items()},
    }
    if pos.shadbala is not None:
        sb = pos.shadbala
        block["shadbala"] = {
            "sthana": {
                "uchcha": round(sb.sthana.uchcha, 4),
                "saptavargaja": round(sb.sthana.saptavargaja, 4),
                "ojayugma": round(sb.sthana.ojayugma, 4),
                "kendradi": round(sb.sthana.kendradi, 4),
                "drekkana": round(sb.sthana.drekkana, 4),
                "total": round(sb.sthana.total, 4),
            },
            "dig": round(sb.dig, 4),
            "kaala": {
                "nathonnatha": round(sb.kaala.nathonnatha, 4),
                "paksha": round(sb.kaala.paksha, 4),
                "tribhaga": round(sb.kaala.tribhaga, 4),
                "varsha_masa_dina_hora": round(sb.kaala.varsha_masa_dina_hora, 4),
                "ayana": round(sb.kaala.ayana, 4),
                "yuddha": round(sb.kaala.yuddha, 4),
                "in_planetary_war": sb.kaala.in_planetary_war,
                "total": round(sb.kaala.total, 4),
            },
            "cheshta": round(sb.cheshta, 4),
            "naisargika": round(sb.naisargika, 4),
            "drik": round(sb.drik, 4),
            "total_virupa": round(sb.total_virupa, 4),
            "total_rupa": round(sb.total_rupa, 4),
            "meets_classical_minimum": sb.meets_requirement,
        }
    return block


def _match_block(match: RuleMatch) -> dict[str, Any]:
    return {
        "key": match.key,
        "strength": match.strength.value,
        "citation": match.citation,
        "provenance": match.provenance,
        "ruleset": match.ruleset,
        "evidence": list(match.evidence),
    }


def _dosha_blocks(reading: FullReading) -> list[dict[str, Any]]:
    out = [{**_match_block(m), "present": True} for m in reading.doshas]
    if reading.kaal_sarpa is not None:
        ks = reading.kaal_sarpa
        out.append(
            {
                "key": ks.key,
                "present": ks.present,
                "strength": ks.strength.value if ks.strength else None,
                "citation": "Traditional (nodal-arc condition)",
                "provenance": "parampara",
                "ruleset": None,
                "evidence": list(ks.evidence),
                "detail": ks.detail,
            }
        )
    if reading.sade_sati is not None:
        ss = reading.sade_sati
        out.append(
            {
                "key": "shani_sade_sati",
                "present": ss.active,
                "strength": None,
                "citation": "Traditional (Saturn transit of the 12th, 1st and 2nd from the Moon)",
                "provenance": "parampara",
                "ruleset": None,
                "evidence": [
                    f"saturn_in_rashi_{ss.saturn_rashi}",
                    f"natal_moon_in_rashi_{ss.moon_rashi}",
                    f"phase_{ss.phase.value}",
                ],
                "detail": {
                    "phase": ss.phase.value,
                    "phase_start_utc": iso_utc(ss.phase_start_utc),
                    "exit_utc": iso_utc(ss.exit_utc),
                    "saturn_retrograde": ss.saturn_retrograde,
                    "exit_provisional": ss.saturn_retrograde,
                },
            }
        )
    return out


def _dasha_block(timeline: VimshottariTimeline, current: CurrentDasha) -> dict[str, Any]:
    return {
        "system": timeline.system.value,
        "year_length": timeline.year_length.value,
        "birth_nakshatra_lord": timeline.birth_nakshatra_lord.value,
        "birth_nakshatra_fraction_elapsed": round(timeline.birth_nakshatra_fraction, 9),
        "balance_years_at_birth": round(timeline.balance_years, 6),
        "current": {
            level.level_name: {
                "lord": level.lord.value,
                "start_utc": iso_utc(level.start_utc),
                "end_utc": iso_utc(level.end_utc),
            }
            for level in current.periods
        },
        # Level 1 in full; deeper levels are 7380 nodes and are fetched on demand
        # by the UI's collapsible tree (CLAUDE.md 8).
        "timeline": [
            {
                "level": p.level,
                "lord": p.lord.value,
                "start_utc": iso_utc(p.start_utc),
                "end_utc": iso_utc(p.end_utc),
            }
            for p in periods_at_level(timeline, 1)
        ],
    }


def _numerology_reading(reading: NumerologyReading) -> dict[str, Any]:
    """One system's totals, or nulls where the name is not in Latin script.

    Nulls rather than zeros: both systems value Latin letters only, so a
    Devanagari name has nothing to sum, and a published 0 reads as a result
    (audit F-025). ``applicable`` says which it is.
    """
    if not reading.applicable:
        return {"applicable": False, "raw_total": None, "reduced": None}
    return {
        "applicable": True,
        "raw_total": reading.raw_total,
        "reduced": reading.reduced,
    }


def _name_block(reading: FullReading) -> dict[str, Any]:
    block: dict[str, Any] = {
        "display_name": reading.birth.name,
        "numerology": {
            "is_jyotish": False,
            "chaldean": _numerology_reading(reading.numerology.chaldean),
            "pythagorean": _numerology_reading(reading.numerology.pythagorean),
        },
    }
    if reading.namakaran is not None:
        nk = reading.namakaran
        block["namakaran"] = {
            "nakshatra_key": nk.nakshatra_key,
            "pada": nk.pada,
            "pada_syllable": nk.pada_syllable,
            "nakshatra_syllables": list(nk.nakshatra_syllables),
            "name_onset": nk.name_onset,
            "matches_pada": nk.matches_pada,
            "matches_nakshatra": nk.matches_nakshatra,
            "evidence": list(nk.evidence),
        }
    return block
