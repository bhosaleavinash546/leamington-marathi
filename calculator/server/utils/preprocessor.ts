export type FileFormat = 'STEP' | 'IGES' | 'Unknown';

export interface PreprocessedCAD {
  format: FileFormat;
  partName: string;
  fileSizeKB: number;
  entityStats: Record<string, number>;   // entity type → count
  boundingBoxEstMm: { x: number; y: number; z: number } | null;
  materialHint: string;
  threadCount: number;
  totalEntities: number;
  coordinateRangeMm: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } | null;
  headerInfo: string;
  summary: string;  // human-readable summary string for Claude
}

function detectFormat(content: string): FileFormat {
  const trimmed = content.trimStart();
  if (trimmed.startsWith('ISO-10303-21')) return 'STEP';
  // IGES: lines are 80 chars wide, check if lines look like fixed-width IGES records
  const firstLine = trimmed.split('\n')[0] ?? '';
  if (firstLine.length >= 72 && /^[A-Z0-9 ,;]/.test(firstLine)) {
    // Check for IGES section markers in column 73
    if (/^.{72}[SGDE DP]\s*\d/.test(firstLine) || /^.{72}[SGDEP]/.test(firstLine)) {
      return 'IGES';
    }
  }
  return 'Unknown';
}

function parseSTEP(content: string, filename: string): Omit<PreprocessedCAD, 'format' | 'fileSizeKB' | 'summary'> {
  // Extract header info
  const headerMatch = content.match(/HEADER;([\s\S]*?)ENDSEC/);
  const headerRaw = headerMatch ? headerMatch[1] : '';

  // Extract FILE_NAME
  const fileNameMatch = headerRaw.match(/FILE_NAME\s*\(\s*'([^']*)'/) ;
  const fileNameInHeader = fileNameMatch ? fileNameMatch[1] : '';

  // Extract FILE_DESCRIPTION
  const fileDescMatch = headerRaw.match(/FILE_DESCRIPTION\s*\(\s*\(\s*'([^']*)'/);
  const fileDesc = fileDescMatch ? fileDescMatch[1] : '';

  // Extract FILE_SCHEMA
  const fileSchemaMatch = headerRaw.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/);
  const fileSchema = fileSchemaMatch ? fileSchemaMatch[1] : '';

  const headerInfo = [
    fileNameInHeader ? `FILE_NAME: ${fileNameInHeader}` : '',
    fileDesc ? `FILE_DESCRIPTION: ${fileDesc}` : '',
    fileSchema ? `FILE_SCHEMA: ${fileSchema}` : '',
  ].filter(Boolean).join('; ');

  // Extract product name
  const productMatch = content.match(/PRODUCT\s*\(\s*'([^']+)'/);
  let partName = productMatch ? productMatch[1] : '';
  if (!partName) {
    partName = fileNameInHeader || filename.replace(/\.[^.]+$/, '');
  }

  // Extract material hint
  const materialMatch = content.match(/MATERIAL\s*\(\s*'([^']+)'/);
  const materialHint = materialMatch ? materialMatch[1] : '';

  // Count entity types in DATA section
  const dataMatch = content.match(/DATA;([\s\S]*?)ENDSEC/);
  const dataSection = dataMatch ? dataMatch[1] : content;

  const entityStats: Record<string, number> = {};
  let totalEntities = 0;
  let threadCount = 0;

  // Key entity types to track
  const keyEntities = [
    'CYLINDRICAL_SURFACE', 'PLANE', 'CONICAL_SURFACE', 'TOROIDAL_SURFACE',
    'SPHERICAL_SURFACE', 'B_SPLINE_SURFACE_WITH_KNOTS', 'B_SPLINE_SURFACE',
    'BEZIER_SURFACE', 'SURFACE_OF_REVOLUTION', 'ADVANCED_FACE', 'FACE_WITH_HOLES',
    'MANIFOLD_SOLID_BREP', 'SHELL_BASED_SURFACE_MODEL', 'CIRCLE', 'HELIX',
    'EDGE_LOOP', 'ADVANCED_BREP_SHAPE_REPRESENTATION', 'FACETED_BREP',
  ];

  // Match entity assignments: #123 = ENTITY_NAME(...)
  const entityRegex = /#\d+\s*=\s*([A-Z_]+)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = entityRegex.exec(dataSection)) !== null) {
    const entityName = match[1];
    totalEntities++;
    if (keyEntities.includes(entityName)) {
      entityStats[entityName] = (entityStats[entityName] ?? 0) + 1;
    }
    if (entityName.includes('THREAD')) {
      threadCount++;
    }
  }

  // Check for thread keywords in parameters too
  const threadParamMatches = (dataSection.match(/THREAD/g) ?? []).length;
  if (threadParamMatches > threadCount) {
    threadCount = threadParamMatches;
  }

  // Extract CARTESIAN_POINT coordinates (max 5000)
  const coordRegex = /CARTESIAN_POINT\('[^']*'\s*,\s*\(([^)]+)\)/g;
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  let coordMatch: RegExpExecArray | null;
  let coordCount = 0;
  while ((coordMatch = coordRegex.exec(dataSection)) !== null && coordCount < 5000) {
    const parts = coordMatch[1].split(',');
    if (parts.length >= 3) {
      const x = parseFloat(parts[0]);
      const y = parseFloat(parts[1]);
      const z = parseFloat(parts[2]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        xs.push(x);
        ys.push(y);
        zs.push(z);
        coordCount++;
      }
    }
  }

  let coordinateRangeMm: PreprocessedCAD['coordinateRangeMm'] = null;
  let boundingBoxEstMm: PreprocessedCAD['boundingBoxEstMm'] = null;

  if (xs.length > 0) {
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    coordinateRangeMm = { minX, maxX, minY, maxY, minZ, maxZ };
    boundingBoxEstMm = {
      x: Math.abs(maxX - minX),
      y: Math.abs(maxY - minY),
      z: Math.abs(maxZ - minZ),
    };
  }

  return {
    partName,
    entityStats,
    boundingBoxEstMm,
    materialHint,
    threadCount,
    totalEntities,
    coordinateRangeMm,
    headerInfo,
  };
}

function parseIGES(content: string, filename: string): Omit<PreprocessedCAD, 'format' | 'fileSizeKB' | 'summary'> {
  const lines = content.split('\n');

  // Parse Global Section (G records)
  const gLines = lines.filter(l => l.length >= 73 && l[72] === 'G');
  const globalSection = gLines.map(l => l.substring(0, 72)).join('');

  // Split by semicolon-separated fields
  const gFields = globalSection.split(/[;,]/);

  // Field 12 (index 11) = file name, Field 14 (index 13) = model name/product name
  const rawPartName = (gFields[13] ?? gFields[11] ?? '').replace(/[HhD]/g, '').trim();
  const partName = rawPartName || filename.replace(/\.[^.]+$/, '');

  // Parse Directory Entry section (D records)
  // Each entity is 2 lines, entity type code is first field of line 1
  const dLines = lines.filter(l => l.length >= 73 && l[72] === 'D');

  const entityStats: Record<string, number> = {};
  let totalEntities = 0;

  // IGES entity type codes
  const entityNames: Record<number, string> = {
    110: 'Line',
    116: 'Point',
    120: 'Surface_of_Revolution',
    122: 'Tab_Cylinder',
    128: 'B_Spline_Surface',
    144: 'Trimmed_Surface',
    150: 'Block',
    160: 'Cylinder',
  };

  // Process odd-numbered D lines (line 1 of each entity pair)
  for (let i = 0; i < dLines.length; i += 2) {
    const line = dLines[i];
    const entityTypeStr = line.substring(0, 8).trim();
    const entityCode = parseInt(entityTypeStr);
    if (!isNaN(entityCode)) {
      totalEntities++;
      const name = entityNames[entityCode] ?? `EntityType_${entityCode}`;
      entityStats[name] = (entityStats[name] ?? 0) + 1;
    }
  }

  return {
    partName,
    entityStats,
    boundingBoxEstMm: null,
    materialHint: '',
    threadCount: 0,
    totalEntities,
    coordinateRangeMm: null,
    headerInfo: `IGES Global: ${globalSection.substring(0, 120)}`,
  };
}

function buildSummary(data: Omit<PreprocessedCAD, 'format' | 'fileSizeKB' | 'summary'>): string {
  const lines: string[] = [];

  lines.push(`Part: "${data.partName}"`);

  // Entity stats
  const entityEntries = Object.entries(data.entityStats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 12);
  if (entityEntries.length > 0) {
    lines.push(`Entities: ${entityEntries.map(([k, v]) => `${k}×${v}`).join(', ')}`);
  }

  if (data.totalEntities > 0) {
    lines.push(`Total entity count: ${data.totalEntities}`);
  }

  if (data.boundingBoxEstMm) {
    const bb = data.boundingBoxEstMm;
    lines.push(`Bounding box estimate: ${bb.x.toFixed(1)}mm × ${bb.y.toFixed(1)}mm × ${bb.z.toFixed(1)}mm`);
  }

  if (data.threadCount > 0) {
    lines.push(`Thread features detected: ${data.threadCount}`);
  }

  const solidType = data.entityStats['MANIFOLD_SOLID_BREP'] ? 'MANIFOLD_SOLID_BREP (closed solid)'
    : data.entityStats['SHELL_BASED_SURFACE_MODEL'] ? 'SHELL_BASED_SURFACE_MODEL (surface body)'
    : data.entityStats['FACETED_BREP'] ? 'FACETED_BREP (faceted solid)'
    : null;
  if (solidType) {
    lines.push(`Solid type: ${solidType}`);
  }

  if (data.materialHint) {
    lines.push(`Material hint: ${data.materialHint}`);
  }

  if (data.headerInfo) {
    lines.push(`Header: ${data.headerInfo}`);
  }

  return lines.join('\n');
}

export function preprocessCADFile(content: string, filename: string, fileSizeBytes: number): PreprocessedCAD {
  const format = detectFormat(content);
  const fileSizeKB = fileSizeBytes / 1024;

  let parsed: Omit<PreprocessedCAD, 'format' | 'fileSizeKB' | 'summary'>;

  if (format === 'STEP') {
    parsed = parseSTEP(content, filename);
  } else if (format === 'IGES') {
    parsed = parseIGES(content, filename);
  } else {
    parsed = {
      partName: filename.replace(/\.[^.]+$/, ''),
      entityStats: {},
      boundingBoxEstMm: null,
      materialHint: '',
      threadCount: 0,
      totalEntities: 0,
      coordinateRangeMm: null,
      headerInfo: '',
    };
  }

  const summary = buildSummary(parsed);

  return {
    format,
    fileSizeKB,
    summary,
    ...parsed,
  };
}
