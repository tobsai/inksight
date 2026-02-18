/**
 * Unit tests for RemarkableCloudClient
 *
 * Tests the authentication flow, service discovery, and document listing
 * using mocked axios requests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { RemarkableCloudClient, RemarkableCloudError } from './client.js';
import { writeFile, readFile } from 'fs/promises';

vi.mock('axios');
vi.mock('fs/promises');

const mockAxios = vi.mocked(axios);
const mockWriteFile = vi.mocked(writeFile);
const mockReadFile = vi.mocked(readFile);

describe('RemarkableCloudClient', () => {
  let client: RemarkableCloudClient;
  let mockHttpClient: {
    post: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockHttpClient = {
      post: vi.fn(),
      get: vi.fn(),
    };

    mockAxios.create.mockReturnValue(mockHttpClient as unknown as ReturnType<typeof axios.create>);

    client = new RemarkableCloudClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('registerDevice', () => {
    it('should register device with valid 8-char code', async () => {
      const deviceToken = 'mock-device-token-jwt';
      mockHttpClient.post.mockResolvedValueOnce({ data: deviceToken });

      const result = await client.registerDevice('ABCD1234');

      expect(result).toBe(deviceToken);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://webapp-prod.cloud.remarkable.engineering/token/json/2/device/new',
        expect.objectContaining({
          code: 'ABCD1234',
          deviceDesc: 'desktop-windows',
          deviceID: expect.any(String),
        }),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should throw error for invalid code length', async () => {
      await expect(client.registerDevice('ABC')).rejects.toThrow(RemarkableCloudError);
      await expect(client.registerDevice('ABC')).rejects.toMatchObject({
        code: 'INVALID_CODE',
      });
    });

    it('should throw error for empty code', async () => {
      await expect(client.registerDevice('')).rejects.toThrow(RemarkableCloudError);
    });

    it('should handle API error', async () => {
      const axiosError = new Error('Network error') as Error & { response?: { status: number } };
      axiosError.response = { status: 400 };
      Object.setPrototypeOf(axiosError, axios.AxiosError.prototype);
      mockHttpClient.post.mockRejectedValueOnce(axiosError);

      await expect(client.registerDevice('ABCD1234')).rejects.toMatchObject({
        code: 'REGISTRATION_FAILED',
      });
    });
  });

  describe('authenticate', () => {
    it('should throw error if no device token', async () => {
      await expect(client.authenticate()).rejects.toMatchObject({
        code: 'NO_DEVICE_TOKEN',
      });
    });

    it('should exchange device token for user token', async () => {
      const deviceToken = 'mock-device-token';
      const userToken = 'mock-user-token-jwt';

      mockHttpClient.post.mockResolvedValueOnce({ data: deviceToken });
      await client.registerDevice('ABCD1234');

      mockHttpClient.post.mockResolvedValueOnce({ data: userToken });
      await client.authenticate();

      expect(mockHttpClient.post).toHaveBeenLastCalledWith(
        'https://webapp-prod.cloud.remarkable.engineering/token/json/2/user/new',
        '',
        expect.objectContaining({
          headers: { Authorization: `Bearer ${deviceToken}` },
        })
      );

      expect(client.isAuthenticated()).toBe(true);
    });

    it('should handle authentication failure', async () => {
      const deviceToken = 'mock-device-token';
      mockHttpClient.post.mockResolvedValueOnce({ data: deviceToken });
      await client.registerDevice('ABCD1234');

      const axiosError = new Error('Unauthorized') as Error & { response?: { status: number } };
      axiosError.response = { status: 401 };
      Object.setPrototypeOf(axiosError, axios.AxiosError.prototype);
      mockHttpClient.post.mockRejectedValueOnce(axiosError);

      await expect(client.authenticate()).rejects.toMatchObject({
        code: 'AUTH_FAILED',
      });
    });
  });

  describe('discoverEndpoints', () => {
    it('should throw error if not authenticated', async () => {
      await expect(client.discoverEndpoints()).rejects.toMatchObject({
        code: 'NOT_AUTHENTICATED',
      });
    });

    it('should discover service endpoints', async () => {
      const authenticatedClient = new RemarkableCloudClient({
        deviceToken: 'mock-device-token',
        userToken: 'mock-user-token',
      });

      mockHttpClient.get.mockResolvedValueOnce({
        data: { Host: 'storage.remarkable.com', Status: 'OK' },
      });

      const endpoints = await authenticatedClient.discoverEndpoints();

      expect(endpoints).toEqual({
        host: 'storage.remarkable.com',
        status: 'OK',
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://service-manager-production-dot-remarkable-production.appspot.com/service/json/1/document-storage',
        expect.objectContaining({
          params: {
            environment: 'production',
            group: 'auth0|5a68dc51cb30df3877a1d7c4',
            apiVer: '2',
          },
          headers: { Authorization: 'Bearer mock-user-token' },
        })
      );
    });

    it('should throw error on invalid endpoint response', async () => {
      const authenticatedClient = new RemarkableCloudClient({
        deviceToken: 'mock-device-token',
        userToken: 'mock-user-token',
      });

      mockHttpClient.get.mockResolvedValueOnce({
        data: { Host: '', Status: 'ERROR' },
      });

      await expect(authenticatedClient.discoverEndpoints()).rejects.toMatchObject({
        code: 'INVALID_ENDPOINTS',
      });
    });
  });

  describe('listDocuments', () => {
    it('should throw error if not authenticated', async () => {
      await expect(client.listDocuments()).rejects.toMatchObject({
        code: 'NOT_AUTHENTICATED',
      });
    });

    it('should list documents from cloud', async () => {
      const authenticatedClient = new RemarkableCloudClient({
        deviceToken: 'mock-device-token',
        userToken: 'mock-user-token',
      });

      mockHttpClient.get.mockResolvedValueOnce({
        data: { Host: 'storage.remarkable.com', Status: 'OK' },
      });

      const mockDocuments = [
        {
          id: 'doc-1',
          version: 1,
          success: true,
          blobURLGet: 'https://storage.remarkable.com/doc-1',
          blobURLGetExpires: '2024-12-31',
          modifiedClient: '2024-01-01',
          type: 'DocumentType',
          visibleName: 'Test Document',
          bookmarked: false,
          parent: '',
        },
      ];

      mockHttpClient.get.mockResolvedValueOnce({ data: mockDocuments });

      const documents = await authenticatedClient.listDocuments();

      expect(documents).toEqual(mockDocuments);
      expect(mockHttpClient.get).toHaveBeenLastCalledWith(
        'https://storage.remarkable.com/document-storage/json/2/docs',
        expect.objectContaining({
          headers: { Authorization: 'Bearer mock-user-token' },
        })
      );
    });

    it('should auto-discover endpoints if not available', async () => {
      const authenticatedClient = new RemarkableCloudClient({
        deviceToken: 'mock-device-token',
        userToken: 'mock-user-token',
      });

      mockHttpClient.get.mockResolvedValueOnce({
        data: { Host: 'storage.remarkable.com', Status: 'OK' },
      });
      mockHttpClient.get.mockResolvedValueOnce({ data: [] });

      await authenticatedClient.listDocuments();

      expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
    });

    it('should throw error on invalid response', async () => {
      const authenticatedClient = new RemarkableCloudClient({
        deviceToken: 'mock-device-token',
        userToken: 'mock-user-token',
      });

      mockHttpClient.get.mockResolvedValueOnce({
        data: { Host: 'storage.remarkable.com', Status: 'OK' },
      });
      mockHttpClient.get.mockResolvedValueOnce({ data: 'not-an-array' });

      await expect(authenticatedClient.listDocuments()).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      });
    });
  });

  describe('getTokens', () => {
    it('should return null when no tokens', () => {
      expect(client.getTokens()).toBeNull();
    });

    it('should return tokens when authenticated', async () => {
      mockHttpClient.post.mockResolvedValueOnce({ data: 'device-token' });
      await client.registerDevice('ABCD1234');

      mockHttpClient.post.mockResolvedValueOnce({ data: 'user-token' });
      await client.authenticate();

      expect(client.getTokens()).toEqual({
        deviceToken: 'device-token',
        userToken: 'user-token',
      });
    });
  });

  describe('saveTokens', () => {
    it('should throw error if no tokens to save', async () => {
      await expect(client.saveTokens('/path/to/tokens.json')).rejects.toMatchObject({
        code: 'NO_TOKENS',
      });
    });

    it('should save tokens to file', async () => {
      const authenticatedClient = new RemarkableCloudClient({
        deviceToken: 'device-token',
        userToken: 'user-token',
      });

      mockWriteFile.mockResolvedValueOnce(undefined);

      await authenticatedClient.saveTokens('/path/to/tokens.json');

      expect(mockWriteFile).toHaveBeenCalledWith(
        '/path/to/tokens.json',
        JSON.stringify({ deviceToken: 'device-token', userToken: 'user-token' }, null, 2),
        'utf-8'
      );
    });

    it('should handle write errors', async () => {
      const authenticatedClient = new RemarkableCloudClient({
        deviceToken: 'device-token',
        userToken: 'user-token',
      });

      mockWriteFile.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(authenticatedClient.saveTokens('/invalid/path')).rejects.toMatchObject({
        code: 'SAVE_FAILED',
      });
    });
  });

  describe('loadTokens', () => {
    it('should load tokens from file', async () => {
      const tokens = { deviceToken: 'device-token', userToken: 'user-token' };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(tokens));

      await client.loadTokens('/path/to/tokens.json');

      expect(client.getTokens()).toEqual(tokens);
      expect(client.isAuthenticated()).toBe(true);
    });

    it('should throw error for invalid JSON', async () => {
      mockReadFile.mockResolvedValueOnce('not valid json');

      await expect(client.loadTokens('/path/to/tokens.json')).rejects.toMatchObject({
        code: 'INVALID_TOKEN_FILE',
      });
    });

    it('should throw error for missing token fields', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ deviceToken: 'only-device' }));

      await expect(client.loadTokens('/path/to/tokens.json')).rejects.toMatchObject({
        code: 'INVALID_TOKEN_FILE',
      });
    });

    it('should handle read errors', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(client.loadTokens('/invalid/path')).rejects.toMatchObject({
        code: 'LOAD_FAILED',
      });
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when not authenticated', () => {
      expect(client.isAuthenticated()).toBe(false);
    });

    it('should return true when authenticated', () => {
      const authenticatedClient = new RemarkableCloudClient({
        deviceToken: 'device-token',
        userToken: 'user-token',
      });
      expect(authenticatedClient.isAuthenticated()).toBe(true);
    });
  });

  describe('full authentication flow', () => {
    it('should complete full registration and auth flow', async () => {
      mockHttpClient.post.mockResolvedValueOnce({ data: 'device-token-abc' });
      const deviceToken = await client.registerDevice('TESTCODE');
      expect(deviceToken).toBe('device-token-abc');

      mockHttpClient.post.mockResolvedValueOnce({ data: 'user-token-xyz' });
      await client.authenticate();
      expect(client.isAuthenticated()).toBe(true);

      mockHttpClient.get.mockResolvedValueOnce({
        data: { Host: 'storage.remarkable.com', Status: 'OK' },
      });
      const endpoints = await client.discoverEndpoints();
      expect(endpoints.host).toBe('storage.remarkable.com');

      mockHttpClient.get.mockResolvedValueOnce({
        data: [
          { id: 'doc-1', visibleName: 'Note 1', type: 'DocumentType' },
          { id: 'doc-2', visibleName: 'Note 2', type: 'DocumentType' },
        ],
      });
      const documents = await client.listDocuments();
      expect(documents).toHaveLength(2);

      const tokens = client.getTokens();
      expect(tokens).toEqual({
        deviceToken: 'device-token-abc',
        userToken: 'user-token-xyz',
      });
    });
  });
});
