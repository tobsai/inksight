/**
 * reMarkable Cloud API Client
 * 
 * Handles authentication, service discovery, and document operations
 * with the reMarkable Cloud API.
 * 
 * Authentication Flow:
 * 1. Register device with 8-character code from my.remarkable.com
 * 2. Receive device token
 * 3. Exchange device token for user token
 * 4. Use user token for all subsequent requests
 */

import axios, { AxiosInstance } from 'axios';
import type {
  RemarkableAuthTokens,
  RemarkableDocument,
  RemarkableServiceEndpoints,
  DownloadedDocument,
} from './types.js';

export class RemarkableCloudClient {
  private deviceToken?: string;
  private userToken?: string;
  private httpClient: AxiosInstance;
  private discoveryURL = 'https://service-manager-production-dot-remarkable-production.appspot.com';
  private endpoints?: RemarkableServiceEndpoints;

  constructor(tokens?: RemarkableAuthTokens) {
    this.deviceToken = tokens?.deviceToken;
    this.userToken = tokens?.userToken;
    
    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'InkSight/0.1.0',
      },
    });
  }

  /**
   * Register this client as a new device using code from my.remarkable.com
   */
  async registerDevice(code: string): Promise<string> {
    throw new Error('Not implemented - Phase 1.1');
    // TODO: Implement device registration
    // POST to device token endpoint with code
    // Return device token
  }

  /**
   * Get user token using device token
   */
  async authenticate(): Promise<void> {
    throw new Error('Not implemented - Phase 1.1');
    // TODO: Implement authentication
    // Use device token to get user token
    // Store user token for subsequent requests
  }

  /**
   * Discover service endpoints (storage, sync, etc.)
   */
  async discoverEndpoints(): Promise<RemarkableServiceEndpoints> {
    throw new Error('Not implemented - Phase 1.1');
    // TODO: Implement service discovery
    // GET service-manager endpoints
    // Cache endpoints
  }

  /**
   * List all documents in the cloud
   */
  async listDocuments(): Promise<RemarkableDocument[]> {
    throw new Error('Not implemented - Phase 1.1');
    // TODO: Implement document listing
    // GET from sync endpoint
    // Parse response
  }

  /**
   * Download a complete document including all files
   */
  async downloadDocument(documentId: string): Promise<DownloadedDocument> {
    throw new Error('Not implemented - Phase 1.1');
    // TODO: Implement document download
    // Download .metadata, .content, .rm files
    // Return structured document
  }

  /**
   * Upload a document to the cloud
   */
  async uploadDocument(document: DownloadedDocument): Promise<void> {
    throw new Error('Not implemented - Phase 1.1');
    // TODO: Implement document upload
    // Upload all files
    // Trigger sync
  }

  /**
   * Delete a document from the cloud
   */
  async deleteDocument(documentId: string): Promise<void> {
    throw new Error('Not implemented - Phase 1.1');
    // TODO: Implement document deletion
  }

  /**
   * Get current tokens for persistence
   */
  getTokens(): RemarkableAuthTokens | null {
    if (!this.deviceToken || !this.userToken) {
      return null;
    }
    return {
      deviceToken: this.deviceToken,
      userToken: this.userToken,
    };
  }
}
