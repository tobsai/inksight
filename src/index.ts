/**
 * InkSight - AI-powered ink transformation for reMarkable Paper Pro
 *
 * Main entry point for the library.
 * Exports all public APIs and utilities.
 */

// Cloud API
import { RemarkableCloudClient } from './cloud/client.js';
export { RemarkableCloudClient, RemarkableCloudError } from './cloud/client.js';
export type {
  RemarkableAuthTokens,
  RemarkableDocument,
  DownloadedDocument,
  DocumentMetadata,
  DocumentContent,
  InkSightConfig,
  TransformPreset,
  TransformSubmitResult,
  TransformStatusResult,
  TransformJobStatus,
  WaitForTransformOptions,
} from './cloud/types.js';

// Device Access
import { RemarkableSSHClient } from './device/ssh-client.js';
export { RemarkableSSHClient } from './device/ssh-client.js';
export type { SSHConnectionConfig, DeviceInfo } from './device/ssh-client.js';

// Parser
export { RMParser } from './parser/rm-parser.js';
export type {
  RMFile,
  RMPage,
  RMLayer,
  RMLine,
  RMPoint,
  ParsedDocument,
  ParsedPage,
  BrushType,
  Color,
} from './parser/types.js';

// AI Providers
export { AIProvider } from './ai/provider.js';
export { OpenAIProvider } from './ai/openai-provider.js';
export type {
  AIProviderConfig,
  TextRecognitionRequest,
  TextRecognitionResponse,
  TextAnalysisRequest,
  TextAnalysisResponse,
  DiagramAnalysisRequest,
  DiagramAnalysisResponse,
} from './ai/provider.js';

// Transformers
export { BaseTransformer } from './transformers/base-transformer.js';
export { TextRecognitionTransformer } from './transformers/text-recognition.js';
export type {
  TransformerConfig,
  TransformResult,
} from './transformers/base-transformer.js';

// Storage
export { DocumentCache } from './storage/cache.js';
export type { CacheOptions, CacheEntry } from './storage/cache.js';

/**
 * Library version
 */
export const VERSION = '0.1.0';

/**
 * Quick start helper function
 */
export function createClient(
  type: 'cloud' | 'ssh',
  config: any
): RemarkableCloudClient | RemarkableSSHClient {
  if (type === 'cloud') {
    return new RemarkableCloudClient(config);
  } else {
    return new RemarkableSSHClient(config);
  }
}
