/**
 * Type definitions for reMarkable binary file format
 * 
 * Based on research from:
 * - https://github.com/ax3l/lines-are-beautiful
 * - https://plasma.ninja/blog/devices/remarkable/binary/format/2017/12/26/reMarkable-lines-file-format.html
 */

export interface RMFile {
  version: number;
  pages: RMPage[];
}

export interface RMPage {
  layers: RMLayer[];
}

export interface RMLayer {
  lines: RMLine[];
}

export interface RMLine {
  brushType: BrushType;
  color: Color;
  unknown1: number;
  brushSize: number;
  unknown2: number;
  points: RMPoint[];
}

export interface RMPoint {
  x: number;
  y: number;
  pressure: number;
  tilt: number;
  speed: number;
}

export enum BrushType {
  BallpointPen = 2,
  Marker = 3,
  Fineliner = 4,
  SharpPencil = 7,
  TiltPencil = 1,
  Brush = 0,
  Highlighter = 5,
  Eraser = 6,
  EraseArea = 8,
  EraseAll = 9,
  CalligraphyPen = 12,
  Pen = 13,
  SelectionBrush = 14,
  PaintBrush = 15,
  MechanicalPencil = 16,
  PencilTilt = 17,
}

export enum Color {
  Black = 0,
  Grey = 1,
  White = 2,
  Yellow = 3,
  Green = 4,
  Pink = 5,
  Blue = 6,
  Red = 7,
  GreyOverlap = 8,
}

export interface ParsedDocument {
  id: string;
  visibleName: string;
  pageCount: number;
  pages: ParsedPage[];
  metadata: {
    lastModified: Date;
    lastOpened: Date;
    parent: string;
    type: string;
  };
}

export interface ParsedPage {
  pageNumber: number;
  layers: ParsedLayer[];
  boundingBox: BoundingBox;
}

export interface ParsedLayer {
  lines: ParsedLine[];
}

export interface ParsedLine {
  brushType: BrushType;
  color: Color;
  brushSize: number;
  points: RMPoint[];
  boundingBox: BoundingBox;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
