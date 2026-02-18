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

import axios, { AxiosInstance, AxiosError } from 'axios';
import { readFile, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import type {
  RemarkableAuthTokens,
  RemarkableDocument,
  RemarkableServiceEndpoints,
  DownloadedDocument,
} from './types.js';

export class RemarkableCloudError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'RemarkableCloudError';
  }
}

const AUTH_BASE_URL = 'https://webapp-prod.cloud.remarkable.engineering';
const DEVICE_TOKEN_ENDPOINT = `${AUTH_BASE_URL}/token/json/2/device/new`;
const USER_TOKEN_ENDPOINT = `${AUTH_BASE_URL}/token/json/2/user/new`;

export class RemarkableCloudClient {
  private deviceToken?: string;
  private userToken?: string;
  private httpClient: AxiosInstance;
  private discoveryURL = 'https://service-manager-production-dot-remarkable-production.appspot.com';
  private endpoints?: RemarkableServiceEndpoints;
  private deviceId: string;

  constructor(tokens?: RemarkableAuthTokens) {
    this.deviceToken = tokens?.deviceToken;
    this.userToken = tokens?.userToken;
    this.deviceId = randomUUID();

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
    if (!code || code.length !== 8) {
      throw new RemarkableCloudError(
        'Invalid registration code. Must be 8 characters.',
        'INVALID_CODE'
      );
    }

    try {
      const response = await this.httpClient.post(
        DEVICE_TOKEN_ENDPOINT,
        {
          code,
          deviceDesc: 'desktop-windows',
          deviceID: this.deviceId,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const deviceToken = response.data;
      if (typeof deviceToken !== 'string' || !deviceToken) {
        throw new RemarkableCloudError(
          'Invalid response from device registration',
          'INVALID_RESPONSE'
        );
      }

      this.deviceToken = deviceToken;
      return deviceToken;
    } catch (error) {
      if (error instanceof RemarkableCloudError) {
        throw error;
      }
      if (error instanceof AxiosError) {
        throw new RemarkableCloudError(
          `Device registration failed: ${error.message}`,
          'REGISTRATION_FAILED',
          error.response?.status
        );
      }
      throw new RemarkableCloudError(
        'Device registration failed',
        'REGISTRATION_FAILED'
      );
    }
  }

  /**
   * Get user token using device token
   */
  async authenticate(): Promise<void> {
    if (!this.deviceToken) {
      throw new RemarkableCloudError(
        'No device token available. Call registerDevice() first.',
        'NO_DEVICE_TOKEN'
      );
    }

    try {
      const response = await this.httpClient.post(USER_TOKEN_ENDPOINT, '', {
        headers: {
          Authorization: `Bearer ${this.deviceToken}`,
        },
      });

      const userToken = response.data;
      if (typeof userToken !== 'string' || !userToken) {
        throw new RemarkableCloudError(
          'Invalid response from user token endpoint',
          'INVALID_RESPONSE'
        );
      }

      this.userToken = userToken;
    } catch (error) {
      if (error instanceof RemarkableCloudError) {
        throw error;
      }
      if (error instanceof AxiosError) {
        throw new RemarkableCloudError(
          `Authentication failed: ${error.message}`,
          'AUTH_FAILED',
          error.response?.status
        );
      }
      throw new RemarkableCloudError('Authentication failed', 'AUTH_FAILED');
    }
  }

  /**
   * Discover service endpoints (storage, sync, etc.)
   */
  async discoverEndpoints(): Promise<RemarkableServiceEndpoints> {
    if (!this.userToken) {
      throw new RemarkableCloudError(
        'Not authenticated. Call authenticate() first.',
        'NOT_AUTHENTICATED'
      );
    }

    try {
      const response = await this.httpClient.get(
        `${this.discoveryURL}/service/json/1/document-storage`,
        {
          params: {
            environment: 'production',
            group: 'auth0|5a68dc51cb30df3877a1d7c4',
            apiVer: '2',
          },
          headers: {
            Authorization: `Bearer ${this.userToken}`,
          },
        }
      );

      const endpoints: RemarkableServiceEndpoints = {
        host: response.data.Host,
        status: response.data.Status,
      };

      if (!endpoints.host || endpoints.status !== 'OK') {
        throw new RemarkableCloudError(
          'Service discovery returned invalid endpoints',
          'INVALID_ENDPOINTS'
        );
      }

      this.endpoints = endpoints;
      return endpoints;
    } catch (error) {
      if (error instanceof RemarkableCloudError) {
        throw error;
      }
      if (error instanceof AxiosError) {
        throw new RemarkableCloudError(
          `Service discovery failed: ${error.message}`,
          'DISCOVERY_FAILED',
          error.response?.status
        );
      }
      throw new RemarkableCloudError(
        'Service discovery failed',
        'DISCOVERY_FAILED'
      );
    }
  }

  /**
   * List all documents in the cloud
   */
  async listDocuments(): Promise<RemarkableDocument[]> {
    if (!this.userToken) {
      throw new RemarkableCloudError(
        'Not authenticated. Call authenticate() first.',
        'NOT_AUTHENTICATED'
      );
    }

    if (!this.endpoints) {
      await this.discoverEndpoints();
    }

    try {
      const response = await this.httpClient.get(
        `https://${this.endpoints!.host}/document-storage/json/2/docs`,
        {
          headers: {
            Authorization: `Bearer ${this.userToken}`,
          },
        }
      );

      if (!Array.isArray(response.data)) {
        throw new RemarkableCloudError(
          'Invalid response from document list endpoint',
          'INVALID_RESPONSE'
        );
      }

      return response.data as RemarkableDocument[];
    } catch (error) {
      if (error instanceof RemarkableCloudError) {
        throw error;
      }
      if (error instanceof AxiosError) {
        throw new RemarkableCloudError(
          `Failed to list documents: ${error.message}`,
          'LIST_FAILED',
          error.response?.status
        );
      }
      throw new RemarkableCloudError(
        'Failed to list documents',
        'LIST_FAILED'
      );
    }
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

  /**
   * Save tokens to a JSON file for persistence
   */
  async saveTokens(path: string): Promise<void> {
    const tokens = this.getTokens();
    if (!tokens) {
      throw new RemarkableCloudError(
        'No tokens to save. Register and authenticate first.',
        'NO_TOKENS'
      );
    }

    try {
      await writeFile(path, JSON.stringify(tokens, null, 2), 'utf-8');
    } catch (error) {
      throw new RemarkableCloudError(
        `Failed to save tokens: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SAVE_FAILED'
      );
    }
  }

  /**
   * Load tokens from a JSON file
   */
  async loadTokens(path: string): Promise<void> {
    try {
      const data = await readFile(path, 'utf-8');
      const tokens: RemarkableAuthTokens = JSON.parse(data);

      if (!tokens.deviceToken || !tokens.userToken) {
        throw new RemarkableCloudError(
          'Invalid token file: missing deviceToken or userToken',
          'INVALID_TOKEN_FILE'
        );
      }

      this.deviceToken = tokens.deviceToken;
      this.userToken = tokens.userToken;
    } catch (error) {
      if (error instanceof RemarkableCloudError) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        throw new RemarkableCloudError(
          'Invalid token file: not valid JSON',
          'INVALID_TOKEN_FILE'
        );
      }
      throw new RemarkableCloudError(
        `Failed to load tokens: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LOAD_FAILED'
      );
    }
  }

  /**
   * Check if the client is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.userToken;
  }
}
