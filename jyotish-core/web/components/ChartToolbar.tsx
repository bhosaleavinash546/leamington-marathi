'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { API_BASE, type BirthInput, type ChartStyle } from '@/lib/api';
import type { NumeralSystem } from '@/lib/format';

/**
 * Chart style, numeral system, locale switch and PDF export.
 *
 * The two toggles CLAUDE.md requires: North Indian / South Indian (§8) and
 * Devanagari / Latin numerals (§7). Both are held in the URL rather than in
 * component state, so a chart is linkable and a reload does not silently revert to
 * the default — and so the server render honours them.
 */
export function ChartToolbar({
  locale,
  style,
  numerals,
  birth,
}: {
  locale: string;
  style: ChartStyle;
  numerals: NumeralSystem;
  birth: BirthInput;
}) {
  const ui = useTranslations('ui');
  const chart = useTranslations('chart');
  const router = useRouter();
  const params = useSearchParams();

  const withParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    return `?${next}`;
  };

  async function exportPdf() {
    const response = await fetch(`${API_BASE}/v1/chart/pdf?style=${style}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(birth),
    });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${birth.name || 'kundali'}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="toolbar" role="toolbar" aria-label={ui('chart_style')}>
      <fieldset className="toolbar__group">
        <legend>{ui('chart_style')}</legend>
        {(['north_indian', 'south_indian'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={style === option}
            onClick={() => router.push(withParam('style', option))}
          >
            {chart(option === 'north_indian' ? 'north_indian' : 'south_indian')}
          </button>
        ))}
      </fieldset>

      <fieldset className="toolbar__group">
        <legend>{ui('numerals_devanagari')}</legend>
        {(['devanagari', 'latin'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={numerals === option}
            onClick={() => router.push(withParam('numerals', option))}
          >
            {option === 'devanagari' ? '०–९' : '0–9'}
          </button>
        ))}
      </fieldset>

      <fieldset className="toolbar__group">
        <legend>locale</legend>
        {(['mr', 'hi', 'en'] as const).map((option) => (
          <a
            key={option}
            aria-current={locale === option ? 'true' : undefined}
            href={`/${option}/kundali?${params}`}
          >
            {option}
          </a>
        ))}
      </fieldset>

      <button type="button" className="primary" onClick={() => void exportPdf()}>
        {ui('export_pdf')}
      </button>
    </div>
  );
}
