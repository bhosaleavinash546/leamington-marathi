/**
 * Typed client for the jyotish-core API.
 *
 * CLAUDE.md 1 has the frontend talking to FastAPI over "typed REST (OpenAPI
 * generated client)". These types are hand-written against the OpenAPI document
 * rather than generated, because generation needs a running server at build time;
 * `npm run typecheck` plus the server's own Pydantic validation catch a mismatch
 * from both ends.
 *
 * Nothing here computes anything. Every number displayed by this app arrives from
 * the engine (CLAUDE.md N1), and there is deliberately no arithmetic in `lib/` or
 * `components/` beyond array indexing.
 */

export const API_BASE = process.env.API_BASE_URL ?? 'http://127.0.0.1:8000';

export type Locale = 'mr' | 'hi' | 'en';
export type TimeAccuracy = 'exact' | 'approx_15min' | 'approx_1hr' | 'unknown';
export type ChartStyle = 'north_indian' | 'south_indian';

export interface PlaceRef {
  name: string;
  latitude: number;
  longitude: number;
  elevation_m?: number;
  iana_tz: string;
}

export interface BirthInput {
  name: string;
  date: string;
  time: string | null;
  time_accuracy: TimeAccuracy;
  time_standard?: 'clock_time_as_recorded' | 'lmt' | 'ist';
  place: PlaceRef;
  gender?: 'm' | 'f' | 'other' | null;
  locale: Locale;
}

/** A limb of the panchang. `*_local` is engine-computed; never convert here. */
export interface Limb {
  key: string;
  index: number;
  start_utc: string | null;
  end_utc: string | null;
  /** How much of the limb had run at the sampled moment, in [0, 1]. From the
   *  engine — see ChartFacts schema 2.0.0. */
  fraction_elapsed?: number;
  paksha?: 'shukla' | 'krishna';
  number_in_paksha?: number;
}

export interface NakshatraState extends Limb {
  pada: number;
  lord: string;
  fraction_elapsed: number;
}

export interface Interval {
  start_utc: string | null;
  end_utc: string | null;
}

export interface Graha {
  key: string;
  sid_lon: number;
  rashi: number;
  rashi_key: string;
  deg_in_rashi: number;
  nakshatra: number;
  nakshatra_key: string;
  pada: number;
  nakshatra_lord: string;
  house_whole_sign: number;
  house_chalit: number;
  retrograde: boolean;
  stationary: boolean;
  combust: boolean;
  dignity: string;
  vargas: Record<string, number>;
  shadbala?: {
    total_rupa: number;
    total_virupa: number;
    meets_classical_minimum: boolean | null;
    sthana: Record<string, number>;
    kaala: Record<string, number | boolean>;
    dig: number;
    cheshta: number;
    naisargika: number;
    drik: number;
  };
}

export interface Finding {
  key: string;
  present?: boolean;
  strength: string | null;
  citation?: string;
  provenance?: string;
  ruleset: string | null;
  /** The array the "why" affordance exposes (CLAUDE.md 8). */
  evidence: string[];
  detail?: Record<string, unknown> | null;
}

export interface DashaPeriod {
  level?: number;
  lord: string;
  start_utc: string | null;
  end_utc: string | null;
}

export interface ChartFacts {
  schema_version: string;
  engine_version: string;
  authority: string;
  ephemeris: {
    provider: string;
    ayanamsa: string;
    ayanamsa_constant: string;
    ayanamsa_value_deg: number;
    ayanamsa_includes_nutation: boolean;
    node_type: string;
    rise_set_convention: string;
  };
  input: {
    name: string;
    date: string;
    time: string | null;
    time_accuracy: TimeAccuracy;
    place: PlaceRef;
    resolved_utc_offset_seconds: number | null;
    birth_utc: string | null;
  };
  confidence: {
    birth_time: TimeAccuracy;
    affected_fields: string[];
    warnings: string[];
  };
  panchang: {
    hindu_civil_date: string;
    hindu_date: {
      shaka_year: number;
      month_key: string;
      month_display_key: string;
      month_anomaly: string;
      suppressed_month_key: string | null;
      paksha: 'shukla' | 'krishna';
      tithi_index: number;
      calendar_variant: string;
    };
    vara: { key: string; index: number; lord: string };
    tithi_at_sunrise: Limb;
    tithi_at_birth?: Limb;
    nakshatra_at_sunrise: NakshatraState;
    nakshatra_at_birth?: NakshatraState;
    yoga_at_sunrise: Limb;
    karana_at_sunrise: Limb;
    tithi_anomaly: string;
    tithi_at_birth_differs_from_sunrise?: boolean;
    sunrise_utc: string | null;
    sunset_utc: string | null;
    moonrise_utc: string | null;
    moonset_utc: string | null;
    rahu_kaal: Interval;
    gulika_kaal: Interval;
    yamaganda: Interval;
    abhijit_muhurta: Interval;
    ishtakaal?: { ghati: number; pala: number; vipala: number; convention: string };
    ritu: { key: string; convention: string };
    ayana: string;
    sun_rashi: number;
  };
  chart?: {
    lagna: {
      sid_lon: number;
      rashi: number;
      rashi_key: string;
      deg_in_rashi: number;
      nakshatra: number;
      nakshatra_key: string;
      pada: number;
    };
    house_system: { primary: string; secondary: string };
    chandra_lagna_rashi: number;
    surya_lagna_rashi: number;
    grahas: Graha[];
    vargas: Record<string, { lagna_rashi: number; houses: Record<string, number> }>;
    ashtakavarga: { sarva: number[]; sarva_total: number; bhinna: Record<string, number[]> };
  };
  dasha?: {
    system: string;
    year_length: string;
    birth_nakshatra_lord: string;
    balance_years_at_birth: number;
    current: Record<string, DashaPeriod>;
    timeline: DashaPeriod[];
  };
  yogas_present?: Finding[];
  doshas?: Finding[];
  name: {
    display_name: string;
    namakaran?: {
      nakshatra_key: string;
      pada: number;
      pada_syllable: string;
      nakshatra_syllables: string[];
      name_onset: string;
      matches_pada: boolean;
      matches_nakshatra: boolean;
      evidence: string[];
    };
    numerology: {
      is_jyotish: false;
      chaldean: { raw_total: number; reduced: number };
      pythagorean: { raw_total: number; reduced: number };
    };
  };
}

export interface ChartResponse {
  facts: ChartFacts;
  glossary: Record<string, Record<string, string>>;
  disclaimer: string;
}

export interface NarrativeSection {
  section: string;
  locale: string;
  text: string;
  is_refusal: boolean;
  cached: boolean;
  model: string;
  prompt_version: string;
  warnings: string[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly key?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    const first = detail?.errors?.[0];
    throw new ApiError(
      first?.message ?? `${path} failed with ${response.status}`,
      response.status,
      first?.key,
    );
  }
  return (await response.json()) as T;
}

export function fetchChart(birth: BirthInput): Promise<ChartResponse> {
  return post<ChartResponse>('/v1/chart', birth);
}

export function fetchNarrative(
  birth: BirthInput,
  sections?: string[],
): Promise<{ sections: NarrativeSection[]; disclaimer: string; generation_enabled: boolean }> {
  return post('/v1/narrative', { birth, sections: sections ?? null });
}

/**
 * The rendered kundali, as SVG markup from the server.
 *
 * Fetched rather than reimplemented in React on purpose: the diamond geometry
 * lives in one place (`render/chart_svg.py`) and is shared with the PDF sheet, so
 * the printed chart and the on-screen chart cannot drift. Interaction is added by
 * wrapping this markup, not by re-drawing it.
 */
export async function fetchChartSvg(
  birth: BirthInput,
  options: {
    style?: ChartStyle;
    varga?: string;
    degrees?: boolean;
    table?: boolean;
    /** The ०–९ / 0–9 toggle. Omitted means the locale's own default. */
    numerals?: string;
  } = {},
): Promise<string> {
  const params = new URLSearchParams();
  if (options.style) params.set('style', options.style);
  if (options.varga) params.set('varga', options.varga);
  if (options.degrees) params.set('degrees', 'true');
  if (options.table) params.set('table', 'true');
  // Without this the house numbers and Ashtakavarga totals inside the diamond
  // stayed Latin while every figure around them was Devanagari.
  if (options.numerals) params.set('numerals', options.numerals);
  const response = await fetch(`${API_BASE}/v1/chart/svg?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(birth),
    cache: 'no-store',
  });
  if (!response.ok) throw new ApiError('chart render failed', response.status);
  return response.text();
}

export function pdfUrl(): string {
  return `${API_BASE}/v1/chart/pdf`;
}
