/**
 * Unit tests for RemarkableCloudClient
 *
 * Tests the authentication flow, service discovery, document listing,
 * and InkSight transform submission / status polling using mocked axios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { RemarkableCloudClient, RemarkableCloudError } from './client.js';
import { writeFile, readFile, mkdir, copyFile, rm } from 'fs/promises';
import JSZip from 'jszip';

vi.mock('axios');
vi.mock('fs/promises');
vi.mock('jszip');

const mockAxios = vi.mocked(axios);
const mockWriteFile = vi.mocked(writeFile);
const mockReadFile = vi.mocked(readFile);
const mockMkdir = vi.mocked(mkdir);
const mockCopyFile = vi.mocked(copyFile);
const mockRm = vi.mocked(rm);
const MockJSZip = vi.mocked(JSZip, true);

// Shared InkSight config used across transform tests
const INKSIGHT_CONFIG = {
  inksightApiKey: 'test-api-key-abc123',
  inksightApiUrl: 'https://inksight-api.mtree.io',
};

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

  // ─── Phase 1.2: InkSight Transform API ────────────────────────────────────

  describe('submitTransform', () => {
    let inksightClient: RemarkableCloudClient;

    beforeEach(() => {
      inksightClient = new RemarkableCloudClient(undefined, INKSIGHT_CONFIG);
    });

    it('should submit a file with default preset and return job info', async () => {
      const mockFileData = Buffer.from('mock rm binary data');
      mockReadFile.mockResolvedValueOnce(mockFileData as any);

      const mockResult = {
        jobId: 'job-abc-123',
        status: 'queued',
        createdAt: '2026-02-18T20:00:00.000Z',
      };
      mockHttpClient.post.mockResolvedValueOnce({ data: mockResult });

      const result = await inksightClient.submitTransform('/path/to/note.rm');

      expect(result).toEqual(mockResult);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://inksight-api.mtree.io/transform',
        expect.any(FormData),
        expect.objectContaining({
          headers: { 'X-API-Key': 'test-api-key-abc123' },
        })
      );
    });

    it('should pass the specified preset to the API', async () => {
      const mockFileData = Buffer.from('mock rm binary data');
      mockReadFile.mockResolvedValueOnce(mockFileData as any);

      mockHttpClient.post.mockResolvedValueOnce({
        data: { jobId: 'job-xyz', status: 'queued', createdAt: '2026-02-18T20:00:00.000Z' },
      });

      await inksightClient.submitTransform('/path/to/note.rm', 'aggressive');

      // Post should have been called — preset is embedded in the FormData body
      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
    });

    it('should throw FILE_NOT_FOUND when the file cannot be read', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));

      await expect(
        inksightClient.submitTransform('/nonexistent/file.rm')
      ).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
    });

    it('should throw SUBMIT_FAILED on API error', async () => {
      mockReadFile.mockResolvedValueOnce(Buffer.from('data') as any);

      const axiosError = Object.assign(new Error('Internal Server Error'), {
        response: { status: 500 },
      });
      Object.setPrototypeOf(axiosError, axios.AxiosError.prototype);
      mockHttpClient.post.mockRejectedValueOnce(axiosError);

      await expect(
        inksightClient.submitTransform('/path/to/note.rm')
      ).rejects.toMatchObject({ code: 'SUBMIT_FAILED', statusCode: 500 });
    });

    it('should throw NO_INKSIGHT_API_KEY when no API key is configured', async () => {
      const clientWithoutKey = new RemarkableCloudClient();
      await expect(
        clientWithoutKey.submitTransform('/path/to/note.rm')
      ).rejects.toMatchObject({ code: 'NO_INKSIGHT_API_KEY' });
    });
  });

  describe('pollTransformStatus', () => {
    let inksightClient: RemarkableCloudClient;

    beforeEach(() => {
      inksightClient = new RemarkableCloudClient(undefined, INKSIGHT_CONFIG);
    });

    it('should return status result for a queued job', async () => {
      const mockStatus = {
        jobId: 'job-abc-123',
        status: 'queued',
        progress: 0,
      };
      mockHttpClient.get.mockResolvedValueOnce({ data: mockStatus });

      const result = await inksightClient.pollTransformStatus('job-abc-123');

      expect(result).toEqual(mockStatus);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://inksight-api.mtree.io/status/job-abc-123',
        expect.objectContaining({
          headers: { 'X-API-Key': 'test-api-key-abc123' },
        })
      );
    });

    it('should return completed result with outputPath', async () => {
      const mockStatus = {
        jobId: 'job-abc-123',
        status: 'completed',
        progress: 100,
        outputPath: 'https://inksight-api.mtree.io/outputs/job-abc-123.md',
      };
      mockHttpClient.get.mockResolvedValueOnce({ data: mockStatus });

      const result = await inksightClient.pollTransformStatus('job-abc-123');

      expect(result.status).toBe('completed');
      expect(result.outputPath).toBeDefined();
    });

    it('should throw POLL_FAILED on API error', async () => {
      const axiosError = Object.assign(new Error('Not Found'), {
        response: { status: 404 },
      });
      Object.setPrototypeOf(axiosError, axios.AxiosError.prototype);
      mockHttpClient.get.mockRejectedValueOnce(axiosError);

      await expect(
        inksightClient.pollTransformStatus('bad-job-id')
      ).rejects.toMatchObject({ code: 'POLL_FAILED', statusCode: 404 });
    });

    it('should throw NO_INKSIGHT_API_KEY when no API key is configured', async () => {
      const clientWithoutKey = new RemarkableCloudClient();
      await expect(
        clientWithoutKey.pollTransformStatus('job-abc-123')
      ).rejects.toMatchObject({ code: 'NO_INKSIGHT_API_KEY' });
    });
  });

  describe('waitForTransform', () => {
    let inksightClient: RemarkableCloudClient;

    beforeEach(() => {
      inksightClient = new RemarkableCloudClient(undefined, INKSIGHT_CONFIG);
    });

    it('should return immediately when job is already completed', async () => {
      const completedStatus = {
        jobId: 'job-done',
        status: 'completed' as const,
        progress: 100,
        outputPath: 'https://inksight-api.mtree.io/outputs/job-done.md',
      };
      const pollSpy = vi
        .spyOn(inksightClient, 'pollTransformStatus')
        .mockResolvedValueOnce(completedStatus);

      const result = await inksightClient.waitForTransform('job-done', {
        pollIntervalMs: 0,
      });

      expect(result).toEqual(completedStatus);
      expect(pollSpy).toHaveBeenCalledTimes(1);
    });

    it('should poll multiple times until completion', async () => {
      const pollSpy = vi
        .spyOn(inksightClient, 'pollTransformStatus')
        .mockResolvedValueOnce({ jobId: 'job-slow', status: 'queued', progress: 0 })
        .mockResolvedValueOnce({ jobId: 'job-slow', status: 'processing', progress: 50 })
        .mockResolvedValueOnce({
          jobId: 'job-slow',
          status: 'completed',
          progress: 100,
          outputPath: '/output/job-slow.md',
        });

      const result = await inksightClient.waitForTransform('job-slow', {
        pollIntervalMs: 0,
        timeoutMs: 60_000,
      });

      expect(result.status).toBe('completed');
      expect(pollSpy).toHaveBeenCalledTimes(3);
    });

    it('should throw TRANSFORM_FAILED when job status is failed', async () => {
      vi.spyOn(inksightClient, 'pollTransformStatus').mockResolvedValueOnce({
        jobId: 'job-fail',
        status: 'failed',
        error: 'Unrecognised file format',
      });

      await expect(
        inksightClient.waitForTransform('job-fail', { pollIntervalMs: 0 })
      ).rejects.toMatchObject({ code: 'TRANSFORM_FAILED' });
    });

    it('should throw TRANSFORM_TIMEOUT when timeout is exceeded', async () => {
      // Always returns 'processing' so we never complete
      vi.spyOn(inksightClient, 'pollTransformStatus').mockResolvedValue({
        jobId: 'job-slow',
        status: 'processing',
        progress: 10,
      });

      await expect(
        inksightClient.waitForTransform('job-slow', {
          pollIntervalMs: 0,
          // Tiny timeout: after first poll succeeds and we check elapsed, it will exceed
          timeoutMs: 1,
        })
      ).rejects.toMatchObject({ code: 'TRANSFORM_TIMEOUT' });
    });

    it('should use custom poll interval and timeout', async () => {
      const pollSpy = vi
        .spyOn(inksightClient, 'pollTransformStatus')
        .mockResolvedValueOnce({ jobId: 'job-custom', status: 'processing', progress: 80 })
        .mockResolvedValueOnce({
          jobId: 'job-custom',
          status: 'completed',
          progress: 100,
          outputPath: '/output/job-custom.md',
        });

      const result = await inksightClient.waitForTransform('job-custom', {
        pollIntervalMs: 0,
        timeoutMs: 30_000,
      });

      expect(result.status).toBe('completed');
      expect(pollSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Phase 1.3: Document Download + Local Delivery ────────────────────────

  /** Helper: build a mock JSZip file object that async() resolves correctly */
  function makeZipFile(content: string | Uint8Array) {
    return {
      async: vi.fn().mockImplementation((type: string) => {
        if (type === 'text') return Promise.resolve(typeof content === 'string' ? content : '');
        if (type === 'uint8array')
          return Promise.resolve(content instanceof Uint8Array ? content : new Uint8Array());
        return Promise.resolve(content);
      }),
    };
  }

  /** Sample metadata and content fixtures */
  const MOCK_DOC_ID = 'doc-uuid-1234';
  const MOCK_BLOB_URL = 'https://blob.storage.remarkable.com/signed/doc-uuid-1234.zip';

  const MOCK_METADATA = {
    deleted: false,
    lastModified: '2026-02-18T00:00:00Z',
    lastOpened: '2026-02-18T00:00:00Z',
    lastOpenedPage: 0,
    metadatamodified: false,
    modified: false,
    parent: '',
    pinned: false,
    synced: true,
    type: 'DocumentType',
    version: 3,
    visibleName: 'My Note',
  };

  const MOCK_CONTENT = {
    coverPageNumber: 0,
    dummyDocument: false,
    extraMetadata: {},
    fileType: 'notebook',
    fontName: '',
    formatVersion: 2,
    lineHeight: -1,
    margins: 100,
    orientation: 'portrait',
    pageCount: 1,
    pages: ['page-uuid-abc'],
    pageTags: [],
    textAlignment: 'left',
    textScale: 1,
  };

  describe('downloadDocument', () => {
    let authenticatedClient: RemarkableCloudClient;

    beforeEach(() => {
      authenticatedClient = new RemarkableCloudClient(
        { deviceToken: 'dev-tok', userToken: 'usr-tok' },
        INKSIGHT_CONFIG
      );
    });

    it('should throw NOT_AUTHENTICATED when not authenticated', async () => {
      await expect(client.downloadDocument(MOCK_DOC_ID)).rejects.toMatchObject({
        code: 'NOT_AUTHENTICATED',
      });
    });

    it('should download and parse a document ZIP successfully', async () => {
      // discoverEndpoints
      mockHttpClient.get.mockResolvedValueOnce({
        data: { Host: 'storage.remarkable.com', Status: 'OK' },
      });

      // POST download URL endpoint
      mockHttpClient.post.mockResolvedValueOnce({
        data: [{ ID: MOCK_DOC_ID, BlobURL: MOCK_BLOB_URL }],
      });

      // GET blob ZIP (arraybuffer)
      mockHttpClient.get.mockResolvedValueOnce({
        data: new ArrayBuffer(8),
      });

      // Mock JSZip
      const mockZip = {
        file: vi.fn().mockImplementation((name: string) => {
          if (name === `${MOCK_DOC_ID}.metadata`)
            return makeZipFile(JSON.stringify(MOCK_METADATA));
          if (name === `${MOCK_DOC_ID}.content`)
            return makeZipFile(JSON.stringify(MOCK_CONTENT));
          if (name === `${MOCK_DOC_ID}/page-uuid-abc.rm`)
            return makeZipFile(new Uint8Array([1, 2, 3]));
          return null;
        }),
      };
      MockJSZip.loadAsync = vi.fn().mockResolvedValue(mockZip);

      const result = await authenticatedClient.downloadDocument(MOCK_DOC_ID);

      expect(result.metadata.visibleName).toBe('My Note');
      expect(result.content.pageCount).toBe(1);
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0]).toEqual(new Uint8Array([1, 2, 3]));
      expect(result.pdfData).toBeUndefined();
    });

    it('should extract optional PDF when present in ZIP', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { Host: 'storage.remarkable.com', Status: 'OK' },
      });
      mockHttpClient.post.mockResolvedValueOnce({
        data: [{ ID: MOCK_DOC_ID, BlobURL: MOCK_BLOB_URL }],
      });
      mockHttpClient.get.mockResolvedValueOnce({ data: new ArrayBuffer(8) });

      const mockZip = {
        file: vi.fn().mockImplementation((name: string) => {
          if (name === `${MOCK_DOC_ID}.metadata`)
            return makeZipFile(JSON.stringify(MOCK_METADATA));
          if (name === `${MOCK_DOC_ID}.content`)
            return makeZipFile(JSON.stringify(MOCK_CONTENT));
          if (name === `${MOCK_DOC_ID}.pdf`)
            return makeZipFile(new Uint8Array([37, 80, 68, 70])); // %PDF magic bytes
          return null;
        }),
      };
      MockJSZip.loadAsync = vi.fn().mockResolvedValue(mockZip);

      const result = await authenticatedClient.downloadDocument(MOCK_DOC_ID);

      expect(result.pdfData).toBeDefined();
      expect(result.pdfData![0]).toBe(37); // %
    });

    it('should fall back to flat page naming (pageId.rm without prefix)', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { Host: 'storage.remarkable.com', Status: 'OK' },
      });
      mockHttpClient.post.mockResolvedValueOnce({
        data: [{ ID: MOCK_DOC_ID, BlobURL: MOCK_BLOB_URL }],
      });
      mockHttpClient.get.mockResolvedValueOnce({ data: new ArrayBuffer(8) });

      const mockZip = {
        file: vi.fn().mockImplementation((name: string) => {
          if (name === `${MOCK_DOC_ID}.metadata`)
            return makeZipFile(JSON.stringify(MOCK_METADATA));
          if (name === `${MOCK_DOC_ID}.content`)
            return makeZipFile(JSON.stringify(MOCK_CONTENT));
          // Only flat naming available
          if (name === 'page-uuid-abc.rm')
            return makeZipFile(new Uint8Array([9, 8, 7]));
          return null;
        }),
      };
      MockJSZip.loadAsync = vi.fn().mockResolvedValue(mockZip);

      const result = await authenticatedClient.downloadDocument(MOCK_DOC_ID);
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0]).toEqual(new Uint8Array([9, 8, 7]));
    });

    it('should throw NO_BLOB_URL when response has no BlobURL', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { Host: 'storage.remarkable.com', Status: 'OK' },
      });
      mockHttpClient.post.mockResolvedValueOnce({
        data: [{ ID: MOCK_DOC_ID }], // no BlobURL
      });

      await expect(authenticatedClient.downloadDocument(MOCK_DOC_ID)).rejects.toMatchObject({
        code: 'NO_BLOB_URL',
      });
    });

    it('should throw DOWNLOAD_FAILED when POST to blob URL endpoint fails', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { Host: 'storage.remarkable.com', Status: 'OK' },
      });

      const axiosError = Object.assign(new Error('Server Error'), {
        response: { status: 500 },
      });
      Object.setPrototypeOf(axiosError, axios.AxiosError.prototype);
      mockHttpClient.post.mockRejectedValueOnce(axiosError);

      await expect(authenticatedClient.downloadDocument(MOCK_DOC_ID)).rejects.toMatchObject({
        code: 'DOWNLOAD_FAILED',
        statusCode: 500,
      });
    });

    it('should throw DOWNLOAD_FAILED when ZIP download fails', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { Host: 'storage.remarkable.com', Status: 'OK' },
      });
      mockHttpClient.post.mockResolvedValueOnce({
        data: [{ ID: MOCK_DOC_ID, BlobURL: MOCK_BLOB_URL }],
      });

      const axiosError = Object.assign(new Error('Forbidden'), {
        response: { status: 403 },
      });
      Object.setPrototypeOf(axiosError, axios.AxiosError.prototype);
      mockHttpClient.get.mockRejectedValueOnce(axiosError);

      await expect(authenticatedClient.downloadDocument(MOCK_DOC_ID)).rejects.toMatchObject({
        code: 'DOWNLOAD_FAILED',
        statusCode: 403,
      });
    });

    it('should throw INVALID_DOCUMENT when .metadata file is missing from ZIP', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { Host: 'storage.remarkable.com', Status: 'OK' },
      });
      mockHttpClient.post.mockResolvedValueOnce({
        data: [{ ID: MOCK_DOC_ID, BlobURL: MOCK_BLOB_URL }],
      });
      mockHttpClient.get.mockResolvedValueOnce({ data: new ArrayBuffer(8) });

      const mockZip = { file: vi.fn().mockReturnValue(null) };
      MockJSZip.loadAsync = vi.fn().mockResolvedValue(mockZip);

      await expect(authenticatedClient.downloadDocument(MOCK_DOC_ID)).rejects.toMatchObject({
        code: 'INVALID_DOCUMENT',
      });
    });

    it('should throw INVALID_DOCUMENT when .content file is missing from ZIP', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { Host: 'storage.remarkable.com', Status: 'OK' },
      });
      mockHttpClient.post.mockResolvedValueOnce({
        data: [{ ID: MOCK_DOC_ID, BlobURL: MOCK_BLOB_URL }],
      });
      mockHttpClient.get.mockResolvedValueOnce({ data: new ArrayBuffer(8) });

      const mockZip = {
        file: vi.fn().mockImplementation((name: string) => {
          if (name === `${MOCK_DOC_ID}.metadata`)
            return makeZipFile(JSON.stringify(MOCK_METADATA));
          return null; // .content missing
        }),
      };
      MockJSZip.loadAsync = vi.fn().mockResolvedValue(mockZip);

      await expect(authenticatedClient.downloadDocument(MOCK_DOC_ID)).rejects.toMatchObject({
        code: 'INVALID_DOCUMENT',
      });
    });
  });

  describe('saveTransformOutput', () => {
    let inksightClient: RemarkableCloudClient;

    beforeEach(() => {
      inksightClient = new RemarkableCloudClient(undefined, INKSIGHT_CONFIG);
      mockMkdir.mockResolvedValue(undefined as any);
    });

    it('should fetch from URL and write to local destination', async () => {
      const mockContent = '# Transformed Note\nSome text here.';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(Buffer.from(mockContent).buffer),
      });
      vi.stubGlobal('fetch', mockFetch);

      mockWriteFile.mockResolvedValue(undefined);

      await inksightClient.saveTransformOutput(
        'https://inksight-api.mtree.io/outputs/job-123.md',
        '/output/dir/result.md'
      );

      expect(mockMkdir).toHaveBeenCalledWith('/output/dir', { recursive: true });
      expect(mockFetch).toHaveBeenCalledWith('https://inksight-api.mtree.io/outputs/job-123.md');
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/output/dir/result.md',
        expect.any(Buffer)
      );
    });

    it('should copy a local file when outputPath is not a URL', async () => {
      mockCopyFile.mockResolvedValue(undefined);

      await inksightClient.saveTransformOutput(
        '/tmp/inksight-job-123.md',
        '/output/dir/result.md'
      );

      expect(mockMkdir).toHaveBeenCalledWith('/output/dir', { recursive: true });
      expect(mockCopyFile).toHaveBeenCalledWith('/tmp/inksight-job-123.md', '/output/dir/result.md');
    });

    it('should throw FETCH_FAILED when remote URL returns non-OK status', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        inksightClient.saveTransformOutput(
          'https://inksight-api.mtree.io/outputs/missing.md',
          '/output/result.md'
        )
      ).rejects.toMatchObject({ code: 'FETCH_FAILED', statusCode: 404 });
    });

    it('should create nested output directories recursively', async () => {
      mockCopyFile.mockResolvedValue(undefined);

      await inksightClient.saveTransformOutput(
        '/tmp/job.md',
        '/deeply/nested/output/dir/result.md'
      );

      expect(mockMkdir).toHaveBeenCalledWith('/deeply/nested/output/dir', { recursive: true });
    });
  });

  describe('downloadAndTransform', () => {
    let inksightClient: RemarkableCloudClient;

    beforeEach(() => {
      inksightClient = new RemarkableCloudClient(
        { deviceToken: 'dev-tok', userToken: 'usr-tok' },
        INKSIGHT_CONFIG
      );
      mockMkdir.mockResolvedValue(undefined as any);
      mockWriteFile.mockResolvedValue(undefined);
      mockRm.mockResolvedValue(undefined);
    });

    it('should run the full pipeline and return document + output path', async () => {
      // Stub downloadDocument
      const mockDoc = {
        metadata: MOCK_METADATA,
        content: MOCK_CONTENT,
        pages: [new Uint8Array([1, 2, 3])],
      };
      vi.spyOn(inksightClient, 'downloadDocument').mockResolvedValue(mockDoc as any);

      // Stub submitTransform
      vi.spyOn(inksightClient, 'submitTransform').mockResolvedValue({
        jobId: 'job-pipeline-1',
        status: 'queued',
        createdAt: '2026-02-18T20:00:00Z',
      });

      // Stub waitForTransform
      vi.spyOn(inksightClient, 'waitForTransform').mockResolvedValue({
        jobId: 'job-pipeline-1',
        status: 'completed',
        progress: 100,
        outputPath: 'https://inksight-api.mtree.io/outputs/job-pipeline-1.md',
      });

      // Stub saveTransformOutput
      vi.spyOn(inksightClient, 'saveTransformOutput').mockResolvedValue(undefined);

      const result = await inksightClient.downloadAndTransform(
        MOCK_DOC_ID,
        'text',
        '/output/dir'
      );

      expect(result.document).toBe(mockDoc);
      expect(result.outputPath).toBe(`/output/dir/${MOCK_DOC_ID}-text.md`);
    });

    it('should pass correct preset for each transform type', async () => {
      const mockDoc = {
        metadata: MOCK_METADATA,
        content: MOCK_CONTENT,
        pages: [new Uint8Array([1])],
      };
      vi.spyOn(inksightClient, 'downloadDocument').mockResolvedValue(mockDoc as any);
      const submitSpy = vi.spyOn(inksightClient, 'submitTransform').mockResolvedValue({
        jobId: 'job-2',
        status: 'queued',
        createdAt: '2026-02-18T20:00:00Z',
      });
      vi.spyOn(inksightClient, 'waitForTransform').mockResolvedValue({
        jobId: 'job-2',
        status: 'completed',
        outputPath: '/tmp/out.md',
      });
      vi.spyOn(inksightClient, 'saveTransformOutput').mockResolvedValue(undefined);

      await inksightClient.downloadAndTransform(MOCK_DOC_ID, 'summary', '/out');

      expect(submitSpy).toHaveBeenCalledWith(expect.any(String), 'aggressive');
    });

    it('should throw NO_PAGES when document has no pages', async () => {
      const mockDoc = {
        metadata: MOCK_METADATA,
        content: MOCK_CONTENT,
        pages: [], // empty
      };
      vi.spyOn(inksightClient, 'downloadDocument').mockResolvedValue(mockDoc as any);

      await expect(
        inksightClient.downloadAndTransform(MOCK_DOC_ID, 'text', '/out')
      ).rejects.toMatchObject({ code: 'NO_PAGES' });
    });

    it('should clean up temp file even when transform fails', async () => {
      const mockDoc = {
        metadata: MOCK_METADATA,
        content: MOCK_CONTENT,
        pages: [new Uint8Array([1])],
      };
      vi.spyOn(inksightClient, 'downloadDocument').mockResolvedValue(mockDoc as any);
      vi.spyOn(inksightClient, 'submitTransform').mockResolvedValue({
        jobId: 'job-fail',
        status: 'queued',
        createdAt: '2026-02-18T20:00:00Z',
      });
      vi.spyOn(inksightClient, 'waitForTransform').mockRejectedValue(
        new RemarkableCloudError('Job failed', 'TRANSFORM_FAILED')
      );

      await expect(
        inksightClient.downloadAndTransform(MOCK_DOC_ID, 'text', '/out')
      ).rejects.toMatchObject({ code: 'TRANSFORM_FAILED' });

      // Cleanup should still have been called
      expect(mockRm).toHaveBeenCalledWith(expect.stringContaining('inksight-'), { force: true });
    });

    it('should throw NO_OUTPUT_PATH when transform completes without outputPath', async () => {
      const mockDoc = {
        metadata: MOCK_METADATA,
        content: MOCK_CONTENT,
        pages: [new Uint8Array([1])],
      };
      vi.spyOn(inksightClient, 'downloadDocument').mockResolvedValue(mockDoc as any);
      vi.spyOn(inksightClient, 'submitTransform').mockResolvedValue({
        jobId: 'job-3',
        status: 'queued',
        createdAt: '2026-02-18T20:00:00Z',
      });
      vi.spyOn(inksightClient, 'waitForTransform').mockResolvedValue({
        jobId: 'job-3',
        status: 'completed',
        progress: 100,
        // no outputPath
      });

      await expect(
        inksightClient.downloadAndTransform(MOCK_DOC_ID, 'text', '/out')
      ).rejects.toMatchObject({ code: 'NO_OUTPUT_PATH' });
    });

    it('should write the first page to temp file before submitting', async () => {
      const pageData = new Uint8Array([10, 20, 30]);
      const mockDoc = {
        metadata: MOCK_METADATA,
        content: MOCK_CONTENT,
        pages: [pageData],
      };
      vi.spyOn(inksightClient, 'downloadDocument').mockResolvedValue(mockDoc as any);
      vi.spyOn(inksightClient, 'submitTransform').mockResolvedValue({
        jobId: 'job-4',
        status: 'queued',
        createdAt: '2026-02-18T20:00:00Z',
      });
      vi.spyOn(inksightClient, 'waitForTransform').mockResolvedValue({
        jobId: 'job-4',
        status: 'completed',
        outputPath: '/tmp/out.md',
      });
      vi.spyOn(inksightClient, 'saveTransformOutput').mockResolvedValue(undefined);

      await inksightClient.downloadAndTransform(MOCK_DOC_ID, 'text', '/out');

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('inksight-'),
        pageData
      );
    });
  });
});
