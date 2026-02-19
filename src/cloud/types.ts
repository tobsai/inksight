/**
 * TypeScript type definitions for reMarkable Cloud API
 * Based on research from splitbrain/ReMarkableAPI and rmapi projects
 */

// ─── InkSight Cloud API ───────────────────────────────────────────────────────

export interface InkSightConfig {
  /** API key for the InkSight Cloud transform service */
  inksightApiKey?: string;
  /** Base URL for the InkSight Cloud API (default: https://inksight-api.mtree.io) */
  inksightApiUrl?: string;
}

export type TransformPreset = 'minimal' | 'medium' | 'aggressive';

export interface TransformSubmitResult {
  jobId: string;
  status: string;
  createdAt: string;
}

export type TransformJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface TransformStatusResult {
  jobId: string;
  status: TransformJobStatus;
  /** Completion percentage 0–100 */
  progress?: number;
  /** Path/URL to the output file when completed */
  outputPath?: string;
  /** Error message when status is 'failed' */
  error?: string;
}

export interface WaitForTransformOptions {
  /** How often to poll (ms). Default: 5000 */
  pollIntervalMs?: number;
  /** Maximum wait time before throwing (ms). Default: 300000 (5 min) */
  timeoutMs?: number;
}

export interface RemarkableAuthTokens {
  deviceToken: string;
  userToken: string;
}

export interface RemarkableDocument {
  id: string;
  version: number;
  message?: string;
  success: boolean;
  blobURLGet: string;
  blobURLGetExpires: string;
  modifiedClient: string;
  type: 'DocumentType' | 'CollectionType';
  visibleName: string;
  currentPage?: number;
  bookmarked: boolean;
  parent: string;
}

export interface RemarkableServiceEndpoints {
  host: string;
  status: string;
}

export interface SyncResponse {
  generation: number;
  hash: string;
}

export interface DownloadedDocument {
  metadata: DocumentMetadata;
  content: DocumentContent;
  pages: Uint8Array[]; // Binary .rm files
  pdfData?: Uint8Array;
}

export interface DocumentMetadata {
  deleted: boolean;
  lastModified: string;
  lastOpened: string;
  lastOpenedPage: number;
  metadatamodified: boolean;
  modified: boolean;
  parent: string;
  pinned: boolean;
  synced: boolean;
  type: 'DocumentType' | 'CollectionType';
  version: number;
  visibleName: string;
}

export interface DocumentContent {
  coverPageNumber: number;
  documentMetadata?: Record<string, unknown>;
  dummyDocument: boolean;
  extraMetadata: {
    LastBrushColor?: string;
    LastBrushThicknessScale?: string;
    LastColor?: string;
    LastEraserThicknessScale?: string;
    LastEraserTool?: string;
    LastPen?: string;
    LastPenColor?: string;
    LastPenThicknessScale?: string;
    LastPencil?: string;
    LastPencilColor?: string;
    LastPencilThicknessScale?: string;
    LastTool?: string;
    ThicknessScale?: string;
  };
  fileType: string;
  fontName: string;
  formatVersion: number;
  lineHeight: number;
  margins: number;
  orientation: 'portrait' | 'landscape';
  pageCount: number;
  pages: string[]; // UUIDs of page files
  pageTags: Array<Record<string, unknown>>;
  textAlignment: string;
  textScale: number;
}
