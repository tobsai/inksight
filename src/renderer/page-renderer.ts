/**
 * Page Renderer — Phase 3.2
 *
 * Renders reMarkable stroke data to PNG images using the canvas package.
 */

import { createCanvas, type Canvas, type CanvasRenderingContext2D } from 'canvas';
import type { RMPage, RMStroke, RMPoint, RenderOptions, RenderResult } from './rm-parser.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const RM_WIDTH  = 1404; // reMarkable page width in .rm units
const RM_HEIGHT = 1872; // reMarkable page height in .rm units

// ─── Color mapping ────────────────────────────────────────────────────────────

/**
 * Map .rm color index → CSS color string (RGBA)
 */
function mapColor(color: number, penType: number): string {
  // Highlighters always use semi-transparent colors
  const isHighlighter = penType === 5 || penType === 18;

  if (isHighlighter) {
    switch (color) {
      case 0: return 'rgba(255, 235, 0, 0.5)';   // yellow
      case 3: return 'rgba(255, 235, 0, 0.5)';   // yellow
      case 4: return 'rgba(0, 255, 0, 0.5)';     // green
      case 5: return 'rgba(255, 105, 180, 0.5)'; // pink
      case 6: return 'rgba(0, 120, 255, 0.5)';   // blue
      default: return 'rgba(255, 235, 0, 0.5)';
    }
  }

  switch (color) {
    case 0: return 'rgba(0, 0, 0, 1)';          // black
    case 1: return 'rgba(128, 128, 128, 1)';    // gray
    case 2: return 'rgba(255, 255, 255, 1)';    // white
    case 3: return 'rgba(255, 235, 0, 0.5)';   // yellow highlight
    case 4: return 'rgba(0, 255, 0, 0.5)';     // green highlight
    case 5: return 'rgba(255, 105, 180, 0.5)'; // pink highlight
    case 6: return 'rgba(0, 120, 255, 0.5)';   // blue highlight
    case 7: return 'rgba(200, 0, 0, 1)';        // red
    case 8: return 'rgba(128, 128, 128, 0.7)'; // grey overlap
    default: return 'rgba(0, 0, 0, 1)';
  }
}

/**
 * Pen type styles:
 *  0, 12  → Brush (variable width based on pressure)
 *  2, 15  → Ballpoint (thin, slight transparency)
 *  3, 16  → Marker (thick, partial transparency)
 *  4, 17  → Fineliner (thin, sharp, full opacity)
 *  5, 18  → Highlighter (thick, 50% opacity)
 *  7, 14  → Pencil (thin, grainy — simulated with dashed stroke)
 *  1      → Tilt Pencil
 *  6      → Eraser
 *  13     → Pen
 */
interface PenStyle {
  baseWidth: number;       // multiplier on stroke.width
  globalAlpha: number;     // overall opacity
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  pressureVariation: boolean; // vary width by pressure
  dashPattern?: number[];  // for pencil simulation
}

function getPenStyle(penType: number): PenStyle {
  switch (penType) {
    case 0:  // Brush
    case 12: // CalligraphyPen
      return { baseWidth: 1.5, globalAlpha: 1.0, lineCap: 'round', lineJoin: 'round', pressureVariation: true };

    case 2:  // BallpointPen
    case 15: // PaintBrush
      return { baseWidth: 0.8, globalAlpha: 0.85, lineCap: 'round', lineJoin: 'round', pressureVariation: false };

    case 3:  // Marker
    case 16: // MechanicalPencil
      return { baseWidth: 2.0, globalAlpha: 0.7, lineCap: 'square', lineJoin: 'round', pressureVariation: false };

    case 4:  // Fineliner
    case 17: // PencilTilt
      return { baseWidth: 0.5, globalAlpha: 1.0, lineCap: 'round', lineJoin: 'round', pressureVariation: false };

    case 5:  // Highlighter
    case 18:
      return { baseWidth: 4.0, globalAlpha: 0.5, lineCap: 'square', lineJoin: 'round', pressureVariation: false };

    case 7:  // SharpPencil
    case 14: // SelectionBrush
      return {
        baseWidth: 0.6, globalAlpha: 0.8, lineCap: 'round', lineJoin: 'round',
        pressureVariation: false, dashPattern: [3, 1],
      };

    case 1:  // TiltPencil
      return { baseWidth: 1.0, globalAlpha: 0.7, lineCap: 'round', lineJoin: 'round', pressureVariation: true };

    case 6:  // Eraser
    case 8:  // EraseArea
    case 9:  // EraseAll
      return { baseWidth: 3.0, globalAlpha: 1.0, lineCap: 'round', lineJoin: 'round', pressureVariation: false };

    case 13: // Pen
    default:
      return { baseWidth: 1.0, globalAlpha: 1.0, lineCap: 'round', lineJoin: 'round', pressureVariation: false };
  }
}

// ─── PageRenderer ─────────────────────────────────────────────────────────────

export class PageRenderer {
  private options: Required<RenderOptions>;

  constructor(options: RenderOptions = {}) {
    this.options = {
      width: options.width ?? RM_WIDTH,
      height: options.height ?? RM_HEIGHT,
      scale: options.scale ?? 1.0,
      backgroundColor: options.backgroundColor ?? 'white',
      antialias: options.antialias ?? true,
    };
  }

  /**
   * Render all layers and strokes of a page to a PNG Buffer.
   */
  render(page: RMPage): RenderResult {
    const start = Date.now();

    const outW = Math.round(this.options.width * this.options.scale);
    const outH = Math.round(this.options.height * this.options.scale);
    const scaleX = outW / RM_WIDTH;
    const scaleY = outH / RM_HEIGHT;

    const canvas = createCanvas(outW, outH);
    const ctx = canvas.getContext('2d');

    // Fill background
    ctx.fillStyle = this.options.backgroundColor;
    ctx.fillRect(0, 0, outW, outH);

    let totalStrokes = 0;

    for (const layer of page.layers) {
      for (const stroke of layer.strokes) {
        this._renderStroke(ctx, stroke, scaleX, scaleY);
        totalStrokes++;
      }
    }

    const png = canvas.toBuffer('image/png');
    const renderTimeMs = Date.now() - start;

    return {
      png,
      width: outW,
      height: outH,
      strokeCount: totalStrokes,
      layerCount: page.layers.length,
      renderTimeMs,
    };
  }

  /**
   * Render only the specified layer (by index) to a PNG Buffer.
   */
  renderLayer(page: RMPage, layerIndex: number): RenderResult {
    const start = Date.now();

    if (layerIndex < 0 || layerIndex >= page.layers.length) {
      throw new Error(
        `Layer index ${layerIndex} out of range (page has ${page.layers.length} layers)`
      );
    }

    const outW = Math.round(this.options.width * this.options.scale);
    const outH = Math.round(this.options.height * this.options.scale);
    const scaleX = outW / RM_WIDTH;
    const scaleY = outH / RM_HEIGHT;

    const canvas = createCanvas(outW, outH);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = this.options.backgroundColor;
    ctx.fillRect(0, 0, outW, outH);

    const layer = page.layers[layerIndex];
    for (const stroke of layer.strokes) {
      this._renderStroke(ctx, stroke, scaleX, scaleY);
    }

    const png = canvas.toBuffer('image/png');
    const renderTimeMs = Date.now() - start;

    return {
      png,
      width: outW,
      height: outH,
      strokeCount: layer.strokes.length,
      layerCount: 1,
      renderTimeMs,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private _renderStroke(
    ctx: CanvasRenderingContext2D,
    stroke: RMStroke,
    scaleX: number,
    scaleY: number
  ): void {
    if (stroke.points.length < 2) return;

    const penStyle = getPenStyle(stroke.penType);
    const color = mapColor(stroke.color, stroke.penType);

    ctx.save();
    ctx.globalAlpha = penStyle.globalAlpha;
    ctx.strokeStyle = color;
    ctx.lineCap = penStyle.lineCap;
    ctx.lineJoin = penStyle.lineJoin;

    if (penStyle.dashPattern) {
      ctx.setLineDash(penStyle.dashPattern);
    }

    if (penStyle.pressureVariation) {
      // Draw each segment with width based on pressure
      this._renderVariableWidthStroke(ctx, stroke, scaleX, scaleY, penStyle);
    } else {
      // Draw entire stroke at uniform width
      const lineWidth = stroke.width * penStyle.baseWidth * Math.min(scaleX, scaleY);
      ctx.lineWidth = Math.max(0.5, lineWidth);

      ctx.beginPath();
      const first = stroke.points[0];
      ctx.moveTo(first.x * scaleX, first.y * scaleY);

      for (let i = 1; i < stroke.points.length; i++) {
        const pt = stroke.points[i];
        ctx.lineTo(pt.x * scaleX, pt.y * scaleY);
      }

      ctx.stroke();
    }

    ctx.restore();
  }

  private _renderVariableWidthStroke(
    ctx: CanvasRenderingContext2D,
    stroke: RMStroke,
    scaleX: number,
    scaleY: number,
    penStyle: PenStyle
  ): void {
    const baseScale = Math.min(scaleX, scaleY);

    for (let i = 1; i < stroke.points.length; i++) {
      const prev = stroke.points[i - 1];
      const curr = stroke.points[i];

      // Vary width by average pressure of segment endpoints
      const avgPressure = (prev.pressure + curr.pressure) / 2;
      const lineWidth = stroke.width * penStyle.baseWidth * baseScale * (0.5 + avgPressure);

      ctx.lineWidth = Math.max(0.5, lineWidth);

      ctx.beginPath();
      ctx.moveTo(prev.x * scaleX, prev.y * scaleY);
      ctx.lineTo(curr.x * scaleX, curr.y * scaleY);
      ctx.stroke();
    }
  }
}
