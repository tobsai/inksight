/**
 * reMarkable .rm File Parser — Phase 3.2
 *
 * Parses binary .rm stroke files (v5 and v6) into structured page data.
 *
 * Binary format (v5/v6):
 *   Header: "reMarkable .lines file, version=N          \n" (43 bytes)
 *   Number of layers (4 bytes, int32LE)
 *   For each layer:
 *     Number of strokes (4 bytes, int32LE)
 *     For each stroke:
 *       Pen type    (4 bytes, int32LE)
 *       Color       (4 bytes, int32LE)
 *       Unknown     (4 bytes)
 *       Width       (4 bytes, float32LE)
 *       Unknown     (4 bytes)
 *       Num points  (4 bytes, int32LE)
 *       For each point:
 *         x         (4 bytes, float32LE)  — 0–1404
 *         y         (4 bytes, float32LE)  — 0–1872
 *         pressure  (4 bytes, float32LE)  — 0.0–1.0
 *         tiltX     (4 bytes, float32LE)
 *         tiltY     (4 bytes, float32LE)
 */

export interface RMPoint {
  x: number;        // 0–1404 (page width in rm units)
  y: number;        // 0–1872 (page height in rm units)
  pressure: number; // 0.0–1.0
  tiltX: number;
  tiltY: number;
  speed: number;
}

export interface RMStroke {
  penType: number;
  color: number;    // 0=black, 1=gray, 2=white, 3-6=highlights
  width: number;    // base stroke width
  points: RMPoint[];
}

export interface RMLayer {
  strokes: RMStroke[];
}

export interface RMPage {
  version: number;
  layers: RMLayer[];
}

// Export as CacheOptions for index re-export convenience
export interface CacheOptions {
  cacheDir: string;
  maxSizeBytes?: number;
  ttlMs?: number;
}

export interface RenderOptions {
  width?: number;
  height?: number;
  scale?: number;
  backgroundColor?: string;
  antialias?: boolean;
}

export interface RenderResult {
  png: Buffer;
  width: number;
  height: number;
  strokeCount: number;
  layerCount: number;
  renderTimeMs: number;
}

const HEADER_PREFIX = 'reMarkable .lines file, version=';
const HEADER_SIZE = 43;

/**
 * Parse a .rm binary file buffer and return structured page data.
 * Supports v5 and v6 formats.
 */
export function parseRMFile(data: Buffer): RMPage {
  if (data.length < HEADER_SIZE) {
    throw new Error('Invalid .rm file: too short to contain a valid header');
  }

  // Read header (43 bytes)
  const header = data.toString('ascii', 0, HEADER_SIZE);

  if (!header.startsWith(HEADER_PREFIX)) {
    throw new Error(
      `Invalid .rm file: expected header starting with "${HEADER_PREFIX}", got: "${header.slice(0, HEADER_PREFIX.length)}"`
    );
  }

  // Extract version from header: "reMarkable .lines file, version=6          \n"
  const afterPrefix = header.slice(HEADER_PREFIX.length);
  const versionMatch = afterPrefix.match(/^(\d+)/);
  if (!versionMatch) {
    throw new Error(`Invalid .rm file: could not parse version from header: "${afterPrefix}"`);
  }

  const version = parseInt(versionMatch[1], 10);

  if (version !== 5 && version !== 6) {
    throw new Error(
      `Unsupported .rm file version ${version}. Only v5 and v6 are supported.`
    );
  }

  let offset = HEADER_SIZE;

  // Read number of layers
  if (data.length < offset + 4) {
    // Empty file with just header — return page with no layers
    return { version, layers: [] };
  }

  const numLayers = data.readInt32LE(offset);
  offset += 4;

  if (numLayers < 0 || numLayers > 1000) {
    throw new Error(`Invalid .rm file: unreasonable layer count ${numLayers}`);
  }

  const layers: RMLayer[] = [];

  for (let li = 0; li < numLayers; li++) {
    if (data.length < offset + 4) {
      throw new Error(`Invalid .rm file: truncated at layer ${li} stroke count`);
    }

    const numStrokes = data.readInt32LE(offset);
    offset += 4;

    if (numStrokes < 0 || numStrokes > 1_000_000) {
      throw new Error(`Invalid .rm file: unreasonable stroke count ${numStrokes} at layer ${li}`);
    }

    const strokes: RMStroke[] = [];

    for (let si = 0; si < numStrokes; si++) {
      // Each stroke header: penType(4) + color(4) + unknown(4) + width(4) + unknown(4) + numPoints(4) = 24 bytes
      if (data.length < offset + 24) {
        throw new Error(`Invalid .rm file: truncated at stroke ${si} in layer ${li}`);
      }

      const penType = data.readInt32LE(offset); offset += 4;
      const color   = data.readInt32LE(offset); offset += 4;
      /* unknown1 */ offset += 4;
      const width   = data.readFloatLE(offset); offset += 4;
      /* unknown2 */ offset += 4;
      const numPoints = data.readInt32LE(offset); offset += 4;

      if (numPoints < 0 || numPoints > 10_000_000) {
        throw new Error(`Invalid .rm file: unreasonable point count ${numPoints}`);
      }

      // Each point: x(4) + y(4) + pressure(4) + tiltX(4) + tiltY(4) = 20 bytes
      // (speed is read from tiltY slot or is a 6th float — some sources say 5 floats, some 6)
      // We read 5 floats per point matching the parser comment
      const POINT_SIZE = 20; // 5 * 4 bytes
      if (data.length < offset + numPoints * POINT_SIZE) {
        throw new Error(
          `Invalid .rm file: truncated point data for stroke ${si} in layer ${li} ` +
          `(need ${numPoints * POINT_SIZE} bytes, have ${data.length - offset})`
        );
      }

      const points: RMPoint[] = [];
      for (let pi = 0; pi < numPoints; pi++) {
        const x        = data.readFloatLE(offset); offset += 4;
        const y        = data.readFloatLE(offset); offset += 4;
        const pressure = data.readFloatLE(offset); offset += 4;
        const tiltX    = data.readFloatLE(offset); offset += 4;
        const tiltY    = data.readFloatLE(offset); offset += 4;
        points.push({ x, y, pressure, tiltX, tiltY, speed: 0 });
      }

      strokes.push({ penType, color, width, points });
    }

    layers.push({ strokes });
  }

  return { version, layers };
}
