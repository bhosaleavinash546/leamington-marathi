"""API, rendering, storage and performance tests (Phases 4-6)."""

from __future__ import annotations

import datetime as dt
import json
import time
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api.locale import (
    SUPPORTED_LOCALES,
    disclaimer,
    finding_label,
    load_glossary,
    term,
)
from api.main import app
from api.routers import geocode, privacy
from api.storage import (
    BirthRepository,
    PayloadCipher,
    StorageError,
    stored_column_names,
)
from core.facts.builder import build_chart_facts, compute_full_reading
from core.types import BirthData, EngineOptions, Place
from render.adapter import rashi_chart, varga_chart
from render.chart_svg import (
    SOUTH_INDIAN_GRID,
    ChartData,
    ChartStyle,
    GrahaMark,
    HouseCell,
    render,
    render_table,
)
from render.pdf import (
    PdfError,
    assert_codepoints_present,
    assert_devanagari_coverage,
    extract_text,
    render_pdf,
)

PUNE = {
    "name": "Pune",
    "latitude": 18.5204,
    "longitude": 73.8567,
    "iana_tz": "Asia/Kolkata",
    "elevation_m": 560.0,
}
BIRTH: dict[str, Any] = {
    "name": "Avinash",
    "date": "1990-06-15",
    "time": "14:32",
    "place": PUNE,
    "locale": "mr",
}


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(scope="module")
def facts() -> dict[str, Any]:
    birth = BirthData(
        name="Avinash",
        date=dt.date(1990, 6, 15),
        time=dt.time(14, 32),
        place=Place("Pune", 18.5204, 73.8567, "Asia/Kolkata", 560.0),
    )
    return build_chart_facts(
        compute_full_reading(birth, now=dt.datetime(2026, 7, 30, 12, 0, tzinfo=dt.UTC))
    )


# ---------------------------------------------------------------------------
# Health and OpenAPI
# ---------------------------------------------------------------------------


def test_health_reports_the_pinned_ayanamsa_constant(client: TestClient) -> None:
    """CLAUDE.md 4.5: an operator can see which ayanamsa is live without a chart."""
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["ayanamsa_constant"] == "SE_SIDM_LAHIRI"
    assert body["authority"] == "date_panchang"
    assert body["locales"] == list(SUPPORTED_LOCALES)


def test_openapi_is_generated_and_covers_every_route(client: TestClient) -> None:
    """CLAUDE.md 11 Phase 4 asks for an OpenAPI spec; it is generated, not written."""
    spec = client.get("/openapi.json").json()
    assert spec["openapi"].startswith("3.")
    paths = set(spec["paths"])
    for route in (
        "/health",
        "/v1/panchang",
        "/v1/chart",
        "/v1/chart/svg",
        "/v1/chart/pdf",
        "/v1/milan",
        "/v1/narrative",
        "/v1/places",
        "/v1/privacy/policy",
        "/v1/privacy/records",
    ):
        assert route in paths, route
    # The description must state the N1 guarantee: it is the product's main claim.
    assert "no number" in spec["info"]["description"].lower()


# ---------------------------------------------------------------------------
# Input validation (CLAUDE.md 3.1)
# ---------------------------------------------------------------------------


def test_a_fixed_offset_is_rejected_in_place_of_a_zone(client: TestClient) -> None:
    """CLAUDE.md 2.2: "Never hand-code offsets."

    A fixed offset cannot express the Bombay Time or wartime-DST transitions, so
    accepting one here would quietly defeat CLAUDE.md 4.1.
    """
    bad = {**BIRTH, "place": {**PUNE, "iana_tz": "+05:30"}}
    response = client.post("/v1/chart", json=bad)
    assert response.status_code == 422
    assert "IANA" in json.dumps(response.json())


def test_unknown_time_must_be_declared(client: TestClient) -> None:
    """CLAUDE.md 4.6: never silently default to noon."""
    response = client.post("/v1/chart", json={**BIRTH, "time": None})
    assert response.status_code == 422
    assert "unknown" in json.dumps(response.json())


def test_declared_unknown_time_is_accepted_and_degrades(client: TestClient) -> None:
    response = client.post("/v1/chart", json={**BIRTH, "time": None, "time_accuracy": "unknown"})
    assert response.status_code == 200
    facts = response.json()["facts"]
    assert "chart" not in facts, "no ascendant means no chart"
    assert "dasha" not in facts
    assert facts["panchang"]["tithi_at_sunrise"]["key"], "the day's panchang survives"
    assert facts["confidence"]["affected_fields"]


def test_unknown_ayanamsa_and_out_of_range_date_are_rejected(client: TestClient) -> None:
    assert client.post("/v1/chart", json={**BIRTH, "ayanamsa": "invented"}).status_code == 422
    assert client.post("/v1/chart", json={**BIRTH, "date": "1200-01-01"}).status_code == 422


def test_extra_fields_are_rejected(client: TestClient) -> None:
    """``extra="forbid"``: a typo'd field name must fail, not be ignored."""
    assert client.post("/v1/chart", json={**BIRTH, "ayanmasa": "lahiri"}).status_code == 422


def test_undefined_sunrise_is_a_422_with_an_explanation(client: TestClient) -> None:
    """CLAUDE.md 3.1: reject loudly. The request is fine; the quantity does not exist."""
    tromso = {
        "name": "Tromso",
        "latitude": 69.6492,
        "longitude": 18.9553,
        "iana_tz": "Europe/Oslo",
    }
    response = client.post("/v1/chart", json={**BIRTH, "date": "2024-06-21", "place": tromso})
    assert response.status_code == 422
    body = response.json()
    assert body["errors"][0]["key"] == "sunrise_undefined_at_this_latitude"
    assert "not an error in the computation" in body["errors"][0]["message"]


def test_polar_warning_reaches_a_valid_response(client: TestClient) -> None:
    tromso = {
        "name": "Tromso",
        "latitude": 69.6492,
        "longitude": 18.9553,
        "iana_tz": "Europe/Oslo",
    }
    response = client.post("/v1/chart", json={**BIRTH, "date": "2024-03-20", "place": tromso})
    assert response.status_code == 200
    assert (
        "polar_latitude_sunrise_may_be_undefined"
        in response.json()["facts"]["confidence"]["warnings"]
    )


# ---------------------------------------------------------------------------
# Chart and panchang
# ---------------------------------------------------------------------------


def test_chart_response_is_schema_valid_and_free_of_devanagari(client: TestClient) -> None:
    """The document is validated on every response, not only in tests."""
    from core.facts.validate import assert_no_devanagari, validate_chart_facts

    body = client.post("/v1/chart", json=BIRTH).json()
    validate_chart_facts(body["facts"])
    assert_no_devanagari(body["facts"])
    # The glossary carries the Devanagari, alongside rather than merged in.
    assert body["glossary"]["rashi"]["tula"] == "तूळ"
    assert body["disclaimer"]


@pytest.mark.parametrize("locale", SUPPORTED_LOCALES)
def test_every_locale_returns_a_full_glossary_and_disclaimer(
    client: TestClient, locale: str
) -> None:
    """CLAUDE.md N5: all three locales are first-class. No English-only screens."""
    body = client.post("/v1/chart", json={**BIRTH, "locale": locale}).json()
    assert len(body["glossary"]["rashi"]) == 12
    assert len(body["glossary"]["nakshatra"]) == 27
    assert len(body["glossary"]["graha"]) == 9
    assert body["disclaimer"] == disclaimer(locale)
    if locale in ("mr", "hi"):
        assert any("ऀ" <= ch <= "ॿ" for ch in body["disclaimer"])


def test_panchang_endpoint_needs_no_birth_time(client: TestClient) -> None:
    response = client.post("/v1/panchang", json={**BIRTH, "time": None, "time_accuracy": "unknown"})
    assert response.status_code == 200
    body = response.json()
    assert body["panchang"]["tithi_at_sunrise"]["key"]
    assert "ishtakaal" not in body["panchang"], "Ishtakaal needs a birth time"


def test_panchang_reports_both_tithis_when_a_time_is_given(client: TestClient) -> None:
    """CLAUDE.md 4.3: both, separately labelled."""
    body = client.post("/v1/panchang", json=BIRTH).json()
    assert "tithi_at_sunrise" in body["panchang"]
    assert "tithi_at_birth" in body["panchang"]
    assert isinstance(body["panchang"]["tithi_at_birth_differs_from_sunrise"], bool)


def test_milan_returns_per_koot_scores_never_a_verdict(client: TestClient) -> None:
    """CLAUDE.md 3.5, 6.7."""
    other = {**BIRTH, "name": "Anjali", "date": "1992-03-11", "time": "07:15", "gender": "f"}
    body = client.post("/v1/milan", json={"bride": other, "groom": BIRTH}).json()
    assert len(body["koots"]) == 8
    assert all(k["evidence"] for k in body["koots"])
    assert body["max_total"] == 36
    assert body["presentation_rule"] == "koot_scores_are_information_not_a_verdict"

    # Scan everything except the guard field itself, which necessarily contains
    # the word "verdict" in order to forbid one.
    scanned = {k: v for k, v in body.items() if k != "presentation_rule"}
    text = json.dumps(scanned).lower()
    for forbidden in ("suitable", "recommend", "compatible", "verdict", "%"):
        assert forbidden not in text, f"the milan response should not contain {forbidden!r}"


def test_milan_requires_a_birth_time_for_both(client: TestClient) -> None:
    timeless = {**BIRTH, "time": None, "time_accuracy": "unknown"}
    response = client.post("/v1/milan", json={"bride": timeless, "groom": BIRTH})
    assert response.status_code == 422
    assert "birth time" in json.dumps(response.json())


# ---------------------------------------------------------------------------
# SVG rendering, including snapshots (CLAUDE.md 9.6)
# ---------------------------------------------------------------------------


def test_north_indian_diamond_has_twelve_labelled_regions(facts: dict[str, Any]) -> None:
    svg = render(rashi_chart(facts, "mr"), ChartStyle.NORTH_INDIAN)
    assert svg.count('class="k-house"') == 12
    for house in range(1, 13):
        assert f'data-house="{house}"' in svg
    assert svg.startswith("<svg") and svg.rstrip().endswith("</svg>")
    assert "<script" not in svg, "the SVG must carry no script"
    assert "http://www.w3.org/2000/svg" in svg


def test_south_indian_grid_is_the_classical_fixed_layout() -> None:
    """Signs fixed, Mesha in the second cell of the top row, running clockwise."""
    assert SOUTH_INDIAN_GRID[0] == (12, 1, 2, 3)
    assert SOUTH_INDIAN_GRID[3] == (9, 8, 7, 6)
    flat = [r for row in SOUTH_INDIAN_GRID for r in row]
    assert sorted(r for r in flat if r is not None) == list(range(1, 13))
    assert flat.count(None) == 4, "the centre 2x2 is empty"


def test_south_indian_places_each_rashi_in_its_fixed_cell(facts: dict[str, Any]) -> None:
    svg = render(rashi_chart(facts, "en"), ChartStyle.SOUTH_INDIAN)
    for rashi in range(1, 13):
        assert f'data-rashi="{rashi}"' in svg


def test_varga_chart_uses_its_own_lagna(facts: dict[str, Any]) -> None:
    """A D9 drawn against the D1 ascendant is the classic error."""
    d1, d9 = rashi_chart(facts, "en"), varga_chart(facts, "D9", "en")
    assert d9.lagna_rashi == facts["chart"]["vargas"]["D9"]["lagna_rashi"]
    for cell in d9.cells:
        expected = (d9.lagna_rashi - 1 + cell.house - 1) % 12 + 1
        assert cell.rashi == expected
    assert d1.title != d9.title


def test_varga_chart_rejects_an_unemitted_varga(facts: dict[str, Any]) -> None:
    with pytest.raises(KeyError, match="D16"):
        varga_chart(facts, "D16", "en")


def test_every_graha_appears_exactly_once_in_the_chart(facts: dict[str, Any]) -> None:
    data = rashi_chart(facts, "en")
    placed = [g.key for cell in data.cells for g in cell.grahas]
    assert sorted(placed) == sorted(g["key"] for g in facts["chart"]["grahas"])


def test_retrograde_and_combust_markers_are_appended_not_substituted() -> None:
    mark = GrahaMark(key="saturn", label="Sa", retrograde=True, combust=True, deg_in_rashi=12.4)
    rendered = mark.render_label(show_degrees=True)
    assert rendered.startswith("Sa")
    assert "(R)" in rendered and "†" in rendered and "12°" in rendered
    devanagari = GrahaMark(key="saturn", label="श", retrograde=True)
    assert "(व)" in devanagari.render_label(show_degrees=False)


def test_chart_data_rejects_a_malformed_house_set() -> None:
    cells = tuple(HouseCell(house=h, rashi=1) for h in range(1, 12))
    with pytest.raises(ValueError, match="exactly 12"):
        ChartData(cells=cells, lagna_rashi=1, title="x", rashi_labels={})
    duplicated = (*cells, HouseCell(house=11, rashi=1))
    with pytest.raises(ValueError, match=r"houses 1\.\.12"):
        ChartData(cells=duplicated, lagna_rashi=1, title="x", rashi_labels={})


def test_svg_snapshot_is_stable(facts: dict[str, Any]) -> None:
    """CLAUDE.md 9.6: snapshot tests on rendered SVG charts.

    Compares two renders of the same data rather than a checked-in golden file: the
    property that matters is determinism, and a byte-file would have to be
    regenerated on every cosmetic change, which trains people to accept diffs
    without reading them.
    """
    data = rashi_chart(facts, "mr")
    first = render(data, ChartStyle.NORTH_INDIAN, show_degrees=True, show_sav=True)
    second = render(
        rashi_chart(facts, "mr"), ChartStyle.NORTH_INDIAN, show_degrees=True, show_sav=True
    )
    assert first == second
    # And the geometry is fixed: these coordinates are what makes A4 printing work.
    assert 'viewBox="0 0 400 400"' in first
    assert "200.0,8.0" in first, "the diamond's top vertex moved"


def test_accessible_table_carries_the_same_data(facts: dict[str, Any]) -> None:
    """CLAUDE.md 8: a semantic table alternative, not a summary."""
    data = rashi_chart(facts, "mr")
    table = render_table(data, headers=("भाव", "रास", "ग्रह"))
    assert table.count("<tr>") == 13  # header + 12 houses
    assert 'scope="row"' in table and "<caption>" in table
    for graha in (g for cell in data.cells for g in cell.grahas):
        assert graha.label in table
    assert "▲" in table, "the ascendant must be marked in the table too"


def test_svg_endpoint_serves_both_styles_and_the_table(client: TestClient) -> None:
    for style in ("north_indian", "south_indian"):
        response = client.post("/v1/chart/svg", json=BIRTH, params={"style": style})
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/svg+xml"
        assert f'data-chart-style="{style}"' in response.text

    table = client.post("/v1/chart/svg", json=BIRTH, params={"table": "true"})
    assert table.status_code == 200
    assert "text/html" in table.headers["content-type"]
    assert "<table" in table.text

    assert client.post("/v1/chart/svg", json=BIRTH, params={"style": "placidus"}).status_code == 400


def test_svg_endpoint_refuses_without_a_birth_time(client: TestClient) -> None:
    response = client.post(
        "/v1/chart/svg", json={**BIRTH, "time": None, "time_accuracy": "unknown"}
    )
    assert response.status_code == 422
    assert "noon" in json.dumps(response.json())


# ---------------------------------------------------------------------------
# PDF (CLAUDE.md 2.2 - "this breaks silently")
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("locale", ("mr", "hi"))
def test_bundled_font_covers_every_locale_character(locale: str) -> None:
    """The check that runs before every Devanagari render."""
    coverage = assert_devanagari_coverage(locale)
    assert coverage.complete
    assert coverage.checked > 50


def test_missing_font_raises_rather_than_rendering_blanks(tmp_path: Any) -> None:
    with pytest.raises(PdfError, match="no Devanagari font"):
        assert_devanagari_coverage("mr", tmp_path / "absent.ttf")


@pytest.mark.parametrize("locale", SUPPORTED_LOCALES)
def test_pdf_renders_and_its_text_survives_extraction(facts: dict[str, Any], locale: str) -> None:
    """CLAUDE.md 2.2: verify ligature and matra rendering *explicitly*.

    Rendering without an exception proves nothing - a missing glyph produces a
    blank. So the text layer is pulled back out and the conjuncts are asserted.
    """
    pdf = render_pdf(facts, locale)
    assert pdf.startswith(b"%PDF-")
    text = extract_text(pdf)
    assert len(text) > 500

    if locale in ("mr", "hi"):
        # Checked at the codepoint level, not as substrings: pypdf reorders the
        # i-matra and the reph during extraction, so `"तिथी" in text` is False even
        # for a correctly rendered page. See render.pdf.extract_text. The question
        # that matters - did the glyphs reach the document - is order-independent.
        probes = "तिथीराहूकाळमंगळइष्टकालनवमांश" if locale == "mr" else "तिथिराहुकालमंगल"
        assert_codepoints_present(pdf, probes)
        # Conjuncts and matras specifically: the characters CLAUDE.md 2.2 names.
        assert_codepoints_present(pdf, "ि ी ू ृ ं ्")
    else:
        assert "Rahu Kaal" in text


def test_ayanamsa_is_reported_even_without_a_birth_time() -> None:
    """The ayanamsa depends on the epoch alone, so it is defined for any date.

    Regression: a time-unknown chart previously reported 0.0000 degrees, which is a
    wrong number rather than an absent one. CLAUDE.md 4.5 requires the value in
    force to be recorded in output.
    """
    from core.enums import TimeAccuracy

    birth = BirthData(
        name="Unknown",
        date=dt.date(1990, 6, 15),
        time=None,
        place=Place("Pune", 18.5204, 73.8567, "Asia/Kolkata"),
        time_accuracy=TimeAccuracy.UNKNOWN,
    )
    timeless = build_chart_facts(
        compute_full_reading(birth, now=dt.datetime(2026, 7, 30, tzinfo=dt.UTC))
    )
    assert "chart" not in timeless
    value = timeless["ephemeris"]["ayanamsa_value_deg"]
    assert 22.0 < value < 25.0, f"ayanamsa reported as {value} without a birth time"


def test_pdf_carries_the_disclaimer_and_the_evidence(facts: dict[str, Any]) -> None:
    """A printed sheet has nothing to tap, so evidence keys are printed inline."""
    text = extract_text(render_pdf(facts, "en"))
    assert "not a forecast" in text.lower() or "not a substitute" in text.lower()
    evidence = facts["doshas"][0]["evidence"][0] if facts.get("doshas") else None
    if evidence:
        assert evidence in text


def test_pdf_endpoint_sets_a_download_filename(client: TestClient) -> None:
    response = client.post("/v1/chart/pdf", json=BIRTH)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "attachment" in response.headers["content-disposition"]


def test_pdf_works_without_a_birth_time(facts: dict[str, Any]) -> None:
    """The panchang half of the sheet is still meaningful (CLAUDE.md 4.6)."""
    from core.enums import TimeAccuracy

    birth = BirthData(
        name="Unknown",
        date=dt.date(1990, 6, 15),
        time=None,
        place=Place("Pune", 18.5204, 73.8567, "Asia/Kolkata"),
        time_accuracy=TimeAccuracy.UNKNOWN,
    )
    timeless = build_chart_facts(
        compute_full_reading(birth, now=dt.datetime(2026, 7, 30, tzinfo=dt.UTC))
    )
    pdf = render_pdf(timeless, "mr")
    assert_codepoints_present(pdf, "तिथी")
    # The confidence banner must appear, listing what was suppressed.
    text = extract_text(pdf)
    assert "जन्मवेळ" in text
    assert "chart.lagna" in text and "dasha" in text


# ---------------------------------------------------------------------------
# Narrative endpoint
# ---------------------------------------------------------------------------


def test_narrative_endpoint_refuses_in_the_requested_locale(client: TestClient) -> None:
    """Generation is disabled in the test environment, so this is the refusal path."""
    from narrative.validator import refusal_string

    body = client.post("/v1/narrative", json={"birth": BIRTH, "sections": ["doshas"]}).json()
    assert body["generation_enabled"] is False
    section = body["sections"][0]
    assert section["is_refusal"]
    assert section["text"] == refusal_string("mr")


def test_narrative_endpoint_rejects_an_unknown_section(client: TestClient) -> None:
    response = client.post("/v1/narrative", json={"birth": BIRTH, "sections": ["career_forecast"]})
    assert response.status_code == 400


def test_narrative_endpoint_does_not_accept_facts(client: TestClient) -> None:
    """A caller must not be able to feed the model arbitrary numbers.

    Accepting a facts payload would be the one hole big enough to defeat
    CLAUDE.md N1, so the schema forbids the field outright.
    """
    response = client.post(
        "/v1/narrative", json={"birth": BIRTH, "facts": {"chart": {"lagna": {"rashi": 1}}}}
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Geocoder (CLAUDE.md 2.2)
# ---------------------------------------------------------------------------


def test_place_search_is_offline_and_ranked(client: TestClient) -> None:
    body = client.get("/v1/places", params={"q": "pun"}).json()
    assert body["offline"] is True
    assert body["results"][0]["name"] == "Pune", "a prefix match should rank first"
    assert body["results"][0]["iana_tz"] == "Asia/Kolkata"


def test_place_search_matches_devanagari(client: TestClient) -> None:
    body = client.get("/v1/places", params={"q": "पुणे"}).json()
    assert any(p["name"] == "Pune" for p in body["results"])


def test_dataset_shortfall_is_reported_not_hidden(client: TestClient) -> None:
    """CLAUDE.md 2.2 asks for ~20k places; the bundle is a seed and says so."""
    dataset = client.get("/v1/places", params={"q": "pune"}).json()["dataset"]
    assert dataset["bundled_places"] == len(geocode.load_places())
    assert dataset["target_places"] == 20_000
    assert dataset["complete"] is False
    assert "seed dataset" in dataset["note"].lower()
    assert "DIVERGENCES" in dataset["note"]


def test_timezone_resolves_offline_from_polygons(client: TestClient) -> None:
    """The half that matters most: a wrong tz silently shifts every value."""
    for lat, lon, expected in (
        (18.52, 73.85, "Asia/Kolkata"),
        (51.5072, -0.1276, "Europe/London"),
        (40.7128, -74.0060, "America/New_York"),
    ):
        body = client.get("/v1/places/resolve", params={"latitude": lat, "longitude": lon}).json()
        assert body["iana_tz"] == expected


def test_an_ocean_coordinate_warns_that_its_zone_is_a_fixed_offset(
    client: TestClient,
) -> None:
    """The tz polygons cover the oceans, so a mid-Atlantic point *does* resolve.

    It resolves to ``Etc/GMT+2``, which is a valid IANA name and a fixed offset in
    disguise: no DST, no historical transitions. Localising a 1943 Indian birth
    with such a zone would silently lose the wartime-DST offset that
    CLAUDE.md 4.1 exists to preserve, so the response warns rather than handing
    back a zone that looks fine.
    """
    body = client.get("/v1/places/resolve", params={"latitude": 0.0, "longitude": -30.0}).json()
    assert body["iana_tz"].startswith("Etc/")
    assert body["warning"] == geocode.OCEAN_ZONE_WARNING
    assert "historical" in body["note"]

    # A civil zone carries no warning.
    civil = client.get("/v1/places/resolve", params={"latitude": 18.52, "longitude": 73.85}).json()
    assert civil["iana_tz"] == "Asia/Kolkata"
    assert civil["warning"] is None


# ---------------------------------------------------------------------------
# Storage and data protection (CLAUDE.md 10)
# ---------------------------------------------------------------------------


@pytest.fixture
def repository() -> BirthRepository:
    return BirthRepository(
        "sqlite+pysqlite:///:memory:", cipher=PayloadCipher(allow_ephemeral=True)
    )


def test_no_derived_value_has_a_column() -> None:
    """CLAUDE.md 2.2: "never store derived values as source of truth"."""
    columns = stored_column_names()
    for derived in (
        "sid_lon",
        "tithi_index",
        "lagna",
        "nakshatra",
        "dasha",
        "shadbala",
        "ashtakavarga",
        "koot",
        "rashi",
    ):
        assert not any(derived in column for column in columns), (
            f"a column matching {derived!r} exists; derived values must be recomputed, never stored"
        )
    assert "engine_version" in columns
    assert "payload_encrypted" in columns


def test_payload_is_encrypted_at_rest(repository: BirthRepository) -> None:
    """The name must not be readable in the stored bytes."""
    from sqlalchemy import select

    from api.storage import BirthRecord

    record_id = repository.store(
        subject_ref="subject-1",
        payload={"name": "अविनाश", "date": "1990-06-15"},
        engine_version="1.0.0",
        schema_version="1.0.0",
        purposes=("compute_and_display_chart",),
    )
    with repository.session() as session:
        blob = session.scalars(
            select(BirthRecord.payload_encrypted).where(BirthRecord.id == record_id)
        ).one()
    assert b"\xe0\xa4" not in blob, "Devanagari bytes are readable in the ciphertext"
    assert "अविनाश" not in blob.decode("utf-8", errors="ignore")
    # And it round-trips.
    stored = repository.get(record_id)
    assert stored is not None and stored.payload["name"] == "अविनाश"


def test_a_missing_encryption_key_is_a_hard_error(monkeypatch: Any) -> None:
    """Falling back to plaintext would be a breach with no visible symptom."""
    monkeypatch.delenv(PayloadCipher.ENV_VAR, raising=False)
    with pytest.raises(StorageError, match=r"never stored unencrypted"):
        PayloadCipher()


def test_a_tampered_ciphertext_fails_to_decrypt() -> None:
    cipher = PayloadCipher(allow_ephemeral=True)
    blob = bytearray(cipher.encrypt({"name": "x"}))
    blob[-1] ^= 0xFF
    with pytest.raises(StorageError, match="could not decrypt"):
        cipher.decrypt(bytes(blob))


def test_storage_requires_a_stated_purpose(repository: BirthRepository) -> None:
    with pytest.raises(StorageError, match="at least one purpose"):
        repository.store(
            subject_ref="s",
            payload={},
            engine_version="1.0.0",
            schema_version="1.0.0",
            purposes=(),
        )
    with pytest.raises(StorageError, match="unknown purpose"):
        repository.store(
            subject_ref="s",
            payload={},
            engine_version="1.0.0",
            schema_version="1.0.0",
            purposes=("sell_to_advertisers",),
        )


def test_export_and_erasure(repository: BirthRepository) -> None:
    ids = [
        repository.store(
            subject_ref="subject-2",
            payload={"name": f"person-{i}"},
            engine_version="1.0.0",
            schema_version="1.0.0",
            purposes=("compute_and_display_chart",),
        )
        for i in range(3)
    ]
    exported = repository.export_subject("subject-2")
    assert len(exported) == 3
    assert {r.payload["name"] for r in exported} == {"person-0", "person-1", "person-2"}

    assert repository.delete_record(ids[0]) is True
    assert repository.delete_record(ids[0]) is False, "delete must be idempotent-safe"
    assert len(repository.export_subject("subject-2")) == 2

    assert repository.delete_subject("subject-2") == 2
    assert repository.export_subject("subject-2") == ()


def test_withdrawing_the_last_consent_deletes_the_record(repository: BirthRepository) -> None:
    """Holding data with no consented purpose would be unlawful."""
    record_id = repository.store(
        subject_ref="subject-3",
        payload={"name": "x"},
        engine_version="1.0.0",
        schema_version="1.0.0",
        purposes=("compute_and_display_chart", "email_report"),
    )
    assert repository.withdraw_consent(record_id, "email_report")
    remaining = repository.get(record_id)
    assert remaining is not None
    assert [c["purpose"] for c in remaining.consents if c["active"]] == [
        "compute_and_display_chart"
    ]

    assert repository.withdraw_consent(record_id, "compute_and_display_chart")
    assert repository.get(record_id) is None, "the record should be gone"


def test_retention_is_enforced_not_merely_stated(repository: BirthRepository) -> None:
    past = dt.datetime(2020, 1, 1, tzinfo=dt.UTC)
    repository.store(
        subject_ref="subject-4",
        payload={"name": "old"},
        engine_version="1.0.0",
        schema_version="1.0.0",
        purposes=("compute_and_display_chart",),
        now=past,
    )
    assert repository.purge_expired(now=past + dt.timedelta(days=10)) == 0
    assert repository.purge_expired(now=past + dt.timedelta(days=400)) == 1
    assert repository.export_subject("subject-4") == ()


def test_privacy_endpoints(client: TestClient, repository: BirthRepository) -> None:
    privacy.set_repository(repository)
    try:
        policy = client.get("/v1/privacy/policy").json()
        assert policy["retention_days"] == 365
        assert "analytics" in policy["analytics_policy"].lower()
        assert set(policy["notice_text"]) == set(SUPPORTED_LOCALES)
        assert any("recomputed" in item for item in policy["not_stored"])

        created = client.post(
            "/v1/privacy/records",
            json={
                "subject_ref": "api-subject",
                "birth": BIRTH,
                "purposes": ["compute_and_display_chart"],
                "consent_given": True,
            },
        )
        assert created.status_code == 201
        record_id = created.json()["record_id"]

        exported = client.get("/v1/privacy/records", params={"subject_ref": "api-subject"}).json()
        assert exported["record_count"] == 1
        assert exported["records"][0]["birth_input"]["name"] == "Avinash"

        assert client.delete(f"/v1/privacy/records/{record_id}").status_code == 204
        assert client.delete(f"/v1/privacy/records/{record_id}").status_code == 404
    finally:
        privacy.set_repository(None)


def test_consent_cannot_be_implied(client: TestClient, repository: BirthRepository) -> None:
    """``consent_given: Literal[True]`` - omitting it or sending false must fail."""
    privacy.set_repository(repository)
    try:
        base = {
            "subject_ref": "s",
            "birth": BIRTH,
            "purposes": ["compute_and_display_chart"],
        }
        assert client.post("/v1/privacy/records", json=base).status_code == 422
        assert (
            client.post("/v1/privacy/records", json={**base, "consent_given": False}).status_code
            == 422
        )
        assert (
            client.post(
                "/v1/privacy/records",
                json={**base, "consent_given": True, "notice_version": "0.0.1"},
            ).status_code
            == 409
        ), "consent to a stale notice version must be refused"
    finally:
        privacy.set_repository(None)


# ---------------------------------------------------------------------------
# Performance (CLAUDE.md 11 Phase 6: full chart < 200 ms server-side)
# ---------------------------------------------------------------------------


@pytest.mark.slow
def test_full_chart_is_under_200ms_server_side() -> None:
    """CLAUDE.md 11 Phase 6: "performance (full chart < 200 ms server-side)".

    Measures the engine plus the ChartFacts build plus schema validation - the whole
    server-side cost of the ``/v1/chart`` route minus HTTP framing. Reports the
    median of several runs so one scheduler hiccup cannot fail the build.
    """
    from core.facts.validate import validate_chart_facts

    birth = BirthData(
        name="Perf",
        date=dt.date(1990, 6, 15),
        time=dt.time(14, 32),
        place=Place("Pune", 18.5204, 73.8567, "Asia/Kolkata", 560.0),
    )
    now = dt.datetime(2026, 7, 30, 12, 0, tzinfo=dt.UTC)

    # One warm-up: the first call pays for tzdata and the rule-file YAML parse.
    validate_chart_facts(build_chart_facts(compute_full_reading(birth, now=now)))

    timings: list[float] = []
    for _ in range(7):
        start = time.perf_counter()
        validate_chart_facts(build_chart_facts(compute_full_reading(birth, now=now)))
        timings.append((time.perf_counter() - start) * 1000.0)

    timings.sort()
    median = timings[len(timings) // 2]
    assert median < 200.0, (
        f"full chart took {median:.0f} ms (median of {len(timings)}); "
        f"budget is 200 ms. All: {[f'{t:.0f}' for t in timings]}"
    )


@pytest.mark.slow
def test_narrative_cache_makes_a_repeat_request_cheap(facts: dict[str, Any]) -> None:
    """The cache is a correctness feature (no drifting text) and a cost one."""
    from narrative.client import ScriptedClient
    from narrative.service import NarrativeService

    service = NarrativeService(ScriptedClient(responses=["Prose (mars_in_house_7)."]))
    service.generate(facts, "doshas", "en")

    start = time.perf_counter()
    for _ in range(50):
        service.generate(facts, "doshas", "en")
    per_call_ms = (time.perf_counter() - start) * 1000.0 / 50
    assert per_call_ms < 20.0, f"a cached section took {per_call_ms:.1f} ms"
    assert service.cache.hits == 50


# ---------------------------------------------------------------------------
# Locale plumbing
# ---------------------------------------------------------------------------


def test_glossary_covers_every_namespace_in_every_locale() -> None:
    for locale in SUPPORTED_LOCALES:
        glossary = load_glossary(locale)
        assert len(glossary["month"]) == 24, "12 months plus 12 adhika forms"
        assert len(glossary["tithi"]) == 16
        assert len(glossary["yoga"]) == 27
        assert len(glossary["karana"]) == 11
        assert len(glossary["vara"]) == 7
        assert len(glossary["bhava"]) == 12


def test_an_unknown_term_falls_back_to_its_key_not_to_english() -> None:
    """An English word in Marathi prose is the CLAUDE.md N5 failure; a Latin key is
    an obvious bug instead."""
    assert term("mr", "rashi", "not_a_real_key") == "not_a_real_key"
    assert term("mr", "rashi", "tula") == "तूळ"


def test_the_web_and_pdf_fonts_are_the_same_file() -> None:
    """The browser and WeasyPrint must draw Devanagari from one font.

    Two copies of the font exist because the two consumers need different
    locations: WeasyPrint reads `render/fonts/` from disk, and Next.js serves
    `web/public/fonts/` over HTTP. If they ever diverge, a conjunct could render
    one way on screen and another in the printed sheet - the same drift the shared
    SVG geometry exists to prevent, and equally silent.

    Compared by bytes rather than by name: a re-subset or a version bump of one
    copy is exactly the change that would slip through a filename check.
    """
    from render.pdf import DEVANAGARI_FONT

    web_copy = DEVANAGARI_FONT.parents[2] / "web" / "public" / "fonts" / DEVANAGARI_FONT.name
    assert web_copy.exists(), (
        f"no browser copy of the font at {web_copy}. The web app's @font-face in "
        "app/globals.css points at /fonts/, so a missing file renders as tofu."
    )
    assert web_copy.read_bytes() == DEVANAGARI_FONT.read_bytes(), (
        "the browser and PDF copies of Noto Sans Devanagari differ. Replace one "
        "with the other so screen and print cannot render a matra differently."
    )


# ---------------------------------------------------------------------------
# F-005 / F-006: every finding the engine emits must have a term in every locale
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("locale", SUPPORTED_LOCALES)
def test_every_rule_key_has_a_display_term(locale: str) -> None:
    """Audit F-005. A finding with no term reaches the reader as a Latin key.

    CLAUDE.md N5: all three locales are first-class. This is the assertion whose
    absence let 29 of 33 rule keys ship untranslated - key parity across locales
    passed because they were missing from all three equally, so parity had nothing
    to compare. This check compares against what the *engine emits* instead.
    """
    from tools.locale_audit import rule_keys

    missing = [key for key in rule_keys() if finding_label(locale, key) == key]
    assert missing == [], f"{locale} has no term for: {missing}"


@pytest.mark.parametrize("locale", SUPPORTED_LOCALES)
def test_claude_md_required_namespaces_exist(locale: str) -> None:
    """CLAUDE.md 7 names ten namespaces. `common` and `dosha` were both absent."""
    from tools.locale_audit import REQUIRED_NAMESPACES

    glossary = load_glossary(locale)
    assert set(glossary) >= REQUIRED_NAMESPACES, (
        f"{locale} missing {sorted(REQUIRED_NAMESPACES - set(glossary))}"
    )


def test_finding_label_searches_namespaces_in_order_then_falls_back_to_the_key() -> None:
    """Chart yogas live in `combination`, doshas in `dosha`, `milan` is the tail.

    The fallback returns the machine key rather than English: a Latin key on a
    Marathi page is an obvious bug, whereas an English word mid-sentence is the
    failure CLAUDE.md N5 forbids and reads as plausible.
    """
    assert finding_label("mr", "gajakesari") == "गजकेसरी योग"
    assert finding_label("mr", "mangal_dosha") == "मंगळ दोष"
    assert finding_label("hi", "mangal_dosha") == "मंगल दोष"
    assert finding_label("mr", "no_such_finding_key") == "no_such_finding_key"


def test_chart_yogas_and_panchang_yogas_are_separate_vocabularies() -> None:
    """The bug's root cause, pinned.

    `locales/*/yoga.json` holds the 27 *nitya* yogas of the panchang's fifth limb;
    chart combinations are a different vocabulary. Resolving findings against the
    panchang list - or against `milan` - is what produced F-005, so the two sets
    are asserted disjoint.
    """
    from tools.locale_audit import rule_keys

    for locale in SUPPORTED_LOCALES:
        nitya = set(load_glossary(locale)["yoga"])
        assert len(nitya) == 27, f"{locale} should have 27 nitya yogas, has {len(nitya)}"
        assert nitya.isdisjoint(set(rule_keys()))


@pytest.mark.parametrize("locale", ["mr", "hi"])
def test_the_printed_sheet_carries_no_latin_machine_key(facts: dict[str, Any], locale: str) -> None:
    """Audit F-005 on the patrika, which has no affordance to tap for a better name."""
    from render.pdf import build_sheet_html
    from tools.locale_audit import rule_keys

    html = build_sheet_html(facts, locale)
    leaked = [key for key in rule_keys() if key in html]
    assert leaked == [], f"{locale} sheet shows raw keys: {leaked}"


@pytest.mark.parametrize("locale", SUPPORTED_LOCALES)
def test_strength_bands_are_localised(locale: str) -> None:
    """The strength tag beside each finding was rendered raw in English."""
    common = load_glossary(locale)["common"]
    for band in ("strong", "moderate", "weak"):
        assert common.get(band), f"{locale} has no term for strength {band!r}"
    if locale in ("mr", "hi"):
        assert all(any("ऀ" <= ch <= "ॿ" for ch in common[b]) for b in ("strong", "moderate", "weak"))


# ---------------------------------------------------------------------------
# F-004: the warning vocabulary reaches the reader as prose, not as keys
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("locale", SUPPORTED_LOCALES)
def test_every_warning_key_has_a_display_term(locale: str) -> None:
    """Audit F-004. Warnings render in the same banner as everything else.

    They were shown as raw Latin machine keys in all three locales - the F-005
    defect in a vocabulary that finding did not cover, which is why the gate now
    parses the warning producers rather than trusting a hand-kept list.
    """
    from tools.locale_audit import warning_keys

    terms = load_glossary(locale)["warning"]
    missing = [key for key in warning_keys() if not terms.get(key, "").strip()]
    assert missing == [], f"{locale} has no term for: {missing}"
    if locale in ("mr", "hi"):
        assert all(any("ऀ" <= ch <= "ॿ" for ch in terms[k]) for k in warning_keys())


def test_a_pre_1955_mumbai_birth_warns_through_the_api(client: TestClient) -> None:
    """End to end: the condition reaches ChartFacts, with the size of the doubt."""
    body = client.post(
        "/v1/chart",
        json={
            "name": "Pre-IST",
            "date": "1948-01-30",
            "time": "10:30",
            "place": {
                "name": "Mumbai",
                "latitude": 19.0760,
                "longitude": 72.8777,
                "iana_tz": "Asia/Kolkata",
            },
            "locale": "mr",
        },
    ).json()
    facts = body["facts"]
    assert "pre_1955_indian_clock_time_ambiguous" in facts["confidence"]["warnings"]

    # Both readings of the same recorded time are published, so the reader can see
    # the gap rather than only be told one exists.
    applied = facts["input"]["resolved_utc_offset_seconds"]
    lmt = facts["input"]["lmt_utc_offset_seconds"]
    assert applied == 19800
    assert 38.0 < (applied - lmt) / 60.0 < 39.5, f"gap {(applied - lmt) / 60.0:.2f} min"

    # And the Marathi term exists for it, rather than a Latin key on the page.
    assert body["glossary"]["warning"]["pre_1955_indian_clock_time_ambiguous"]


def test_the_printed_sheet_prints_its_warnings(facts: dict[str, Any]) -> None:
    """The banner used to fire on warnings and then not print them."""
    from render.pdf import build_sheet_html

    polar = {
        **facts,
        "confidence": {
            **facts["confidence"],
            "warnings": ["polar_latitude_sunrise_may_be_undefined"],
        },
    }
    html = build_sheet_html(polar, "mr")
    term = load_glossary("mr")["warning"]["polar_latitude_sunrise_may_be_undefined"]
    assert term in html, "the sheet triggered a banner but printed no warning text"


# ---------------------------------------------------------------------------
# The patrika cluster: F-010, F-011, F-012, F-013, F-025
# ---------------------------------------------------------------------------


def test_grahaspashta_is_printed_in_rashi_degree_minute(facts: dict[str, Any]) -> None:
    """Audit F-010. Decimal degrees are what mark a sheet as machine-generated."""
    import re

    from render.pdf import build_sheet_html

    html = build_sheet_html(facts, "mr")
    assert re.search(r"[ऀ-ॿ]+\s[०-९]+°[०-९]{2}'", html), "no rashi-degree-minute cell found"
    # The old form, e.g. "मिथुन 0.28°", must be gone.
    assert not re.search(r"[ऀ-ॿ]+\s\d+\.\d+°", html)


def test_format_dm_carries_a_rounded_sixty_into_the_degree() -> None:
    """29.9999° must read 30°00', never 29°60'."""
    from core.angles import format_dm

    assert format_dm(12.7333) == "12°44'"
    assert format_dm(29.9999) == "30°00'"
    assert format_dm(0.2833) == "0°17'"


@pytest.mark.parametrize("locale", ["mr", "hi"])
def test_the_sheet_prints_devanagari_numerals(locale: str, facts: dict[str, Any]) -> None:
    """Audit F-011. The web had the toggle since Phase 5; the sheet had 0 of them.

    Only the engine version and the evidence keys may stay Latin: both are
    machine identifiers a reader checks against the engine, and a digit inside
    ``mars_in_house_7`` is part of the key.
    """
    import re

    from render.pdf import build_sheet_html

    html = build_sheet_html(facts, locale)
    # Visible text only. SVG <title> and <desc> are accessibility text, which
    # carries English ordinals ("1st house") by a documented decision in
    # chart_svg.py. Logged as F-026 rather than swept into this assertion: it is
    # an N5 question, not a numeral one.
    stripped = re.sub(
        r"<style.*?</style>|<desc>.*?</desc>|<title[^>]*>.*?</title>", "", html, flags=re.S
    )
    visible = re.sub(r"<[^>]+>", " ", stripped)
    assert len(re.findall(r"[०-९]", visible)) > 100
    stray = {
        token
        for token in re.findall(r"\S*[0-9]\S*", visible)
        if token != facts["engine_version"] and "_" not in token
    }
    assert stray == set(), f"Latin digits left on the {locale} sheet: {sorted(stray)}"


def test_the_english_sheet_keeps_latin_numerals(facts: dict[str, Any]) -> None:
    """The converter is locale-bound, not global."""
    import re

    from render.pdf import build_sheet_html

    html = build_sheet_html(facts, "en")
    assert re.search(r"\d", html)
    assert not re.search(r"[०-९]", html)


def test_dinamana_and_ratrimana_are_computed_and_printed(facts: dict[str, Any]) -> None:
    """Audit F-012. A Marathi sheet prints both beside sunrise and sunset."""
    from render.pdf import build_sheet_html

    span = facts["panchang"]["day_night_length"]
    assert span["dinamana"]["ghati"] + span["ratrimana"]["ghati"] in (59, 60)
    # Night runs to the *next* sunrise, so the pair covers the whole Hindu day.
    total = span["dinamana"]["minutes"] + span["ratrimana"]["minutes"]
    assert 1430.0 < total < 1450.0, f"day+night = {total:.1f} min, not ~1440"

    html = build_sheet_html(facts, "mr")
    assert load_glossary("mr")["panchang"]["dinamana"] in html
    assert load_glossary("mr")["panchang"]["ratrimana"] in html


def test_namakaran_reaches_the_printed_sheet(facts: dict[str, Any]) -> None:
    """Audit F-013. It was computed and published in ChartFacts, but never shown.

    (The audit register said it was absent from ChartFacts; that was wrong - it
    sits under `name.namakaran`. What was missing is the rendering.)
    """
    from render.pdf import build_sheet_html

    assert facts["name"]["namakaran"]["pada_syllable"]
    html = build_sheet_html(facts, "mr")
    ui = load_glossary("mr")["ui"]
    assert ui["namakaran"] in html
    assert facts["name"]["namakaran"]["pada_syllable"] in html


def test_numerology_reports_inapplicability_rather_than_zero() -> None:
    """Audit F-025. Both systems value Latin letters only.

    A Devanagari name has nothing to sum, and a published 0 reads as a result -
    for a Marathi-first product that would be nearly every user. Transliterating
    first would invent a convention CLAUDE.md 11 forbids.
    """
    from render.pdf import build_sheet_html

    devanagari = build_chart_facts(
        compute_full_reading(
            BirthData(
                name="अविनाश",
                date=dt.date(1990, 6, 15),
                time=dt.time(14, 32),
                place=Place("Pune", 18.5204, 73.8567, "Asia/Kolkata", 560.0),
            ),
            now=dt.datetime(2026, 7, 30, 12, 0, tzinfo=dt.UTC),
        )
    )
    reading = devanagari["name"]["numerology"]["chaldean"]
    assert reading["applicable"] is False
    assert reading["raw_total"] is None and reading["reduced"] is None
    assert load_glossary("mr")["ui"]["not_applicable_to_script"] in build_sheet_html(
        devanagari, "mr"
    )

    latin = build_chart_facts(
        compute_full_reading(
            BirthData(
                name="Avinash",
                date=dt.date(1990, 6, 15),
                time=dt.time(14, 32),
                place=Place("Pune", 18.5204, 73.8567, "Asia/Kolkata", 560.0),
            ),
            now=dt.datetime(2026, 7, 30, 12, 0, tzinfo=dt.UTC),
        )
    )
    assert latin["name"]["numerology"]["chaldean"] == {
        "applicable": True,
        "raw_total": 22,
        "reduced": 4,
    }


# ---------------------------------------------------------------------------
# The honesty trio: F-014, F-015, F-016
# ---------------------------------------------------------------------------


def test_every_rule_declares_its_doctrinal_standing() -> None:
    """Audit F-014. A rule that does not say cannot have its standing judged."""
    from core.rules.engine import PROVENANCE_BANDS, load_doshas, load_yogas

    for rule in (*load_yogas(), *load_doshas()):
        assert rule.provenance in PROVENANCE_BANDS, f"{rule.key}: {rule.provenance!r}"


def test_a_rule_without_a_provenance_band_fails_to_load(tmp_path: Any) -> None:
    """The gate, not just the data: an unannotated rule must fail the build."""
    from core.rules.engine import RuleError, load_rules

    bad = tmp_path / "bad.yaml"
    bad.write_text(
        "rules:\n  - key: nonsense\n    citation: x\n    when: {retrograde: {graha: mars}}\n",
        encoding="utf-8",
    )
    with pytest.raises(RuleError, match="provenance"):
        load_rules(bad)


def test_the_five_traditional_rules_are_labelled_parampara() -> None:
    """The rules that say "not in the classical samhitas" must not read as shastra."""
    from core.rules.engine import load_doshas, load_yogas

    bands = {(r.key, r.ruleset): r.provenance for r in (*load_yogas(), *load_doshas())}
    assert bands[("pitra_dosha", None)] == "parampara"
    assert bands[("shrapit_dosha", None)] == "parampara"
    assert bands[("guru_chandal_dosha", None)] == "parampara"
    assert bands[("mangal_dosha", "north_school")] == "parampara"
    assert bands[("mangal_dosha", "maharashtra")] == "shastra"


@pytest.mark.parametrize("locale", SUPPORTED_LOCALES)
def test_the_provenance_band_is_readable_in_every_locale(locale: str) -> None:
    """The whole point of F-014: the signal was English-only and collapsed."""
    common = load_glossary(locale)["common"]
    for band in ("shastra", "parampara"):
        assert common.get(band, "").strip(), f"{locale} has no term for {band}"
        assert common.get(f"{band}_note", "").strip()
    if locale in ("mr", "hi"):
        assert any("ऀ" <= ch <= "ॿ" for ch in common["shastra"])
        assert any("ऀ" <= ch <= "ॿ" for ch in common["parampara"])


def test_provenance_reaches_chartfacts_and_the_printed_sheet(facts: dict[str, Any]) -> None:
    from render.pdf import build_sheet_html

    findings = [*facts["yogas_present"], *facts["doshas"]]
    assert findings, "test premise: the chart has findings"
    assert all(f.get("provenance") in ("shastra", "parampara") for f in findings)

    html = build_sheet_html(facts, "mr")
    present = {f["provenance"] for f in findings if f.get("present") is not False}
    for band in present:
        assert load_glossary("mr")["common"][band] in html


def test_kaal_sarpa_refuses_the_yoga_dosha_classification() -> None:
    """Audit F-016. The schools disagree, so the engine declines to pick.

    It publishes the arc and the completeness - every datum the competing schools
    key on - and says the classification is not assigned, rather than shipping a
    finding labelled "dosha" that quietly takes one side.
    """
    from core.chart.assemble import compute_chart
    from core.doshas.computed import kaal_sarpa
    from core.ephemeris.registry import build_ephemeris
    from core.panchang.day import panchang_for_instant

    eph = build_ephemeris(EngineOptions())
    when = dt.datetime(1990, 6, 15, 9, 2, tzinfo=dt.UTC)
    place = Place("Pune", 18.5204, 73.8567, "Asia/Kolkata", 560.0)
    day, _moment = panchang_for_instant(eph, dt.date(1990, 6, 15), when, place)
    chart = compute_chart(eph, when, place, day.lights, day.vara.index)

    finding = kaal_sarpa(chart)
    if finding.present:
        assert finding.detail is not None
        assert finding.detail["classification"] == "not_assigned"
        assert finding.detail["classification_reason"] == "yoga_vs_dosha_is_school_dependent"

    # And the name a Marathi reader sees does not assert "dosha" either.
    assert "दोष" not in finding_label("mr", "kaal_sarpa")
