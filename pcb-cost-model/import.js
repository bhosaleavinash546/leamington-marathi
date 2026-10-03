/* ============================================================================
 * import.js — Design-file import (beta): extract board parameters from
 * Gerber (RS-274X) and Excellon drill files, entirely in the browser.
 *
 * What it extracts (honestly bounded — this is not a full CAM parser):
 *  - Board W×H  : bounding box of coordinates in outline/copper Gerbers,
 *                 using the file's %FS coordinate format and %MO units.
 *  - Hole count : Excellon drill hit count → hole density from board area.
 *  - Layer count: inferred from copper-layer filename conventions
 *                 (KiCad F_Cu / In1_Cu / B_Cu, Protel GTL / G1… / GBL,
 *                  Eagle cmp / lyN / sol, generic top/bottom/inner names).
 * Zip archives are not parsed — extract and drop the individual files.
 * ==========================================================================*/

const GerberImport = (() => {

  /* ---- Gerber (RS-274X): units + coordinate format + bounding box ---- */
  function parseGerberExtents(text) {
    let unitsMm = null;
    if (/%MOMM\*%/i.test(text)) unitsMm = true;
    else if (/%MOIN\*%/i.test(text)) unitsMm = false;
    const fs = text.match(/%FS[LT][AI]X(\d)(\d)Y(\d)(\d)\*%/i);
    const decX = fs ? parseInt(fs[2]) : 6;   // modern CAM default 4.6 / 3.6
    const decY = fs ? parseInt(fs[4]) : 6;
    if (unitsMm === null) unitsMm = true;    // KiCad/modern default

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, hits = 0;
    // Only D01/D02 operations carry geometry; D03 flashes count too.
    const re = /(?:X(-?\d+))?(?:Y(-?\d+))?(?:I-?\d+)?(?:J-?\d+)?D0?[123]\*/g;
    let m, lastX = null, lastY = null;
    while ((m = re.exec(text)) !== null) {
      if (m[1] != null) lastX = parseInt(m[1]) / Math.pow(10, decX);
      if (m[2] != null) lastY = parseInt(m[2]) / Math.pow(10, decY);
      if (lastX == null || lastY == null) continue;
      const x = unitsMm ? lastX : lastX * 25.4;
      const y = unitsMm ? lastY : lastY * 25.4;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      hits++;
    }
    if (hits < 2 || !isFinite(minX)) return null;
    return { w: +(maxX - minX).toFixed(2), h: +(maxY - minY).toFixed(2), hits };
  }

  /* ---- Excellon drill: units, tool table, hole hits, min tool ---- */
  function parseExcellon(text) {
    let unitsMm = /METRIC/i.test(text) || /M71/.test(text);
    if (/INCH/i.test(text) || /M72/.test(text)) unitsMm = false;
    let minTool = Infinity;
    const toolRe = /^T\d+.*?C([\d.]+)/gm;
    let t;
    while ((t = toolRe.exec(text)) !== null) {
      const d = parseFloat(t[1]);
      if (isFinite(d) && d > 0) minTool = Math.min(minTool, unitsMm ? d : d * 25.4);
    }
    // Hole hits: coordinate lines (XnYn), excluding header/tool/format lines.
    const holes = (text.match(/^X-?[\d.]+Y-?[\d.]+/gm) || []).length;
    if (holes === 0) return null;
    return { holes, minToolMm: isFinite(minTool) ? +minTool.toFixed(3) : null };
  }

  /* ---- Copper-layer counting from filenames ---- */
  const COPPER_PATTERNS = [
    /-F_Cu\.(gbr|g\w*)$/i, /-B_Cu\.(gbr|g\w*)$/i, /-In\d+_Cu\.(gbr|g\w*)$/i,   // KiCad
    /\.gtl$/i, /\.gbl$/i, /\.g\d+l?$/i, /\.gp\d+$/i, /\.in\d+$/i,              // Protel/Altium
    /\.cmp$/i, /\.sol$/i, /\.ly\d+$/i,                                          // Eagle
    /(^|[._-])(top|bottom)([._-]?(copper|layer|cu))?\.(gbr|ger|pho)$/i,          // generic
  ];
  function isCopperName(name) { return COPPER_PATTERNS.some((re) => re.test(name)); }
  function isDrillName(name) { return /\.(drl|xln|txt|drr|tap|exc)$/i.test(name) || /drill/i.test(name); }
  function isOutlineName(name) {
    return /-Edge_Cuts\./i.test(name) || /\.(gko|gm1|gml)$/i.test(name) || /outline|profile|boardoutline/i.test(name);
  }

  /* ---- Main: files (from an <input type=file>) → suggested parameters ---- */
  async function importFiles(fileList) {
    const files = Array.from(fileList || []);
    const report = { notes: [], suggested: {} };
    if (!files.length) { report.notes.push("No files provided."); return report; }
    if (files.some((f) => /\.zip$/i.test(f.name))) {
      report.notes.push("Zip archives aren't parsed — extract the archive and drop the individual Gerber/drill files.");
    }

    let copperCount = 0, outlineExtents = null, anyExtents = null, drill = null;
    for (const f of files) {
      if (/\.zip$/i.test(f.name) || f.size > 30 * 1024 * 1024) continue;
      let text;
      try { text = await f.text(); } catch (e) { continue; }
      if (isDrillName(f.name) && /T\d+/.test(text)) {
        const d = parseExcellon(text);
        if (d) { drill = drill ? { holes: drill.holes + d.holes, minToolMm: Math.min(drill.minToolMm || 9, d.minToolMm || 9) } : d; }
        continue;
      }
      if (/%FS|%MO|D0[123]\*/.test(text)) {                 // looks like Gerber
        const ext = parseGerberExtents(text);
        if (ext) {
          if (isOutlineName(f.name)) outlineExtents = ext;   // outline wins
          else if (!anyExtents || ext.w * ext.h > anyExtents.w * anyExtents.h) anyExtents = ext;
        }
        if (isCopperName(f.name)) copperCount++;
      } else if (isCopperName(f.name)) {
        copperCount++;
      }
    }

    const ext = outlineExtents || anyExtents;
    if (ext && ext.w > 5 && ext.h > 5 && ext.w < 1200 && ext.h < 1200) {
      report.suggested.boardW = Math.round(ext.w);
      report.suggested.boardH = Math.round(ext.h);
      report.notes.push(`Board extents ${ext.w} × ${ext.h} mm from ${outlineExtents ? "outline layer" : "largest copper layer"}.`);
    }
    if (copperCount >= 2) {
      report.suggested.layerCount = copperCount;
      report.notes.push(`${copperCount} copper layers detected from filenames.`);
    } else if (copperCount === 1) {
      report.notes.push("Only one copper-layer file recognised — layer count not set (upload all copper Gerbers).");
    }
    if (drill && report.suggested.boardW && report.suggested.boardH) {
      const areaDm2 = (report.suggested.boardW * report.suggested.boardH) / 10000;
      report.suggested.holeDensity = Math.max(10, Math.round(drill.holes / areaDm2 / 10) * 10);
      report.notes.push(`${drill.holes} drill hits → ${report.suggested.holeDensity} holes/dm²` +
        (drill.minToolMm ? `; min tool Ø ${drill.minToolMm} mm.` : "."));
    } else if (drill) {
      report.notes.push(`${drill.holes} drill hits found, but no board extents — hole density not set.`);
    }
    if (!Object.keys(report.suggested).length) {
      report.notes.push("Nothing recognisable found. Supported: RS-274X Gerbers (extents, layer names) and Excellon drill files.");
    }
    return report;
  }

  return { importFiles, parseGerberExtents, parseExcellon };
})();
