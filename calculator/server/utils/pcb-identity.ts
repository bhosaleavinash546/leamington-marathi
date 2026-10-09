/**
 * A part number is evidence only when something other than the model stands behind it (PCB pipeline review F1,
 * 9 Oct 2026, docs/pcb/pcb-pipeline-review-2026-10-09.md).
 *
 * The model's part number used to be looked up in the catalogue and counted as CONFIRMED whatever it was: "TDA4VH"
 * written on an unread chip priced the line at £104 with nothing to verify (radar fixture £53.31 → £144.57). Now a
 * part number prices a line from the catalogue only when it is backed by
 *   - an OCR marking that agrees with it (`ocrExtracted` after `verifyOcrClaims`),
 *   - the user's BOM file or BOM image (`bomSource`), or
 *   - the user's own correction (`userCorrected`).
 * Any other part number is kept as `suggestedPartNumber` — shown, never priced — and the line is priced like any
 * unread part, from its class range, and listed to verify.
 */
export type IdentityEvidence = 'ocr' | 'bom-file' | 'user' | 'none';

type Line = Record<string, unknown>;

export function identityEvidenceOf(l: Line): IdentityEvidence {
  if (l.userCorrected === true) return 'user';
  if (l.bomSource === 'file' || l.bomSource === 'image') return 'bom-file';
  if (l.ocrExtracted === true) return 'ocr';
  return 'none';
}

export function gateIdentities(bom: Line[]): { bom: Line[]; withheld: string[] } {
  const withheld: string[] = [];
  const out = bom.map(l => {
    const pn = String(l.partNumber ?? '').trim();
    const evidence = identityEvidenceOf(l);
    if (!pn || evidence !== 'none') return pn ? { ...l, identityEvidence: evidence } : l;
    withheld.push(`${String(l.refDes ?? '?')} ${pn}`);
    return {
      ...l,
      partNumber: '',
      suggestedPartNumber: pn,
      identityEvidence: 'none',
      lineConf: Math.min(Number(l.lineConf) || 0, 0.59),
      priceNote: `Part number ${pn} was suggested by the AI but not read on the chip, in a BOM file or by you — priced from its class range; confirm the part`
        + (l.priceNote ? ` · ${String(l.priceNote)}` : ''),
    };
  });
  return { bom: out, withheld };
}
