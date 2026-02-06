/**
 * SSH Client for Direct reMarkable Device Access
 * 
 * Provides direct access to the reMarkable device via SSH over WiFi or USB.
 * This is an alternative to the Cloud API for offline or real-time scenarios.
 * 
 * Connection methods:
 * - WiFi: Find device IP, connect on port 22
 * - USB: Connect to 10.11.99.1 when USB web interface is enabled
 * 
 * File locations on device:
 * - Documents: /home/root/.local/share/remarkable/xochitl/
 * - System info: /etc/version, /etc/remarkable.conf
 */

export interface SSHConnectionConfig {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  privateKeyPath?: string;
}

export interface DeviceInfo {
  version: string;
  serial: string;
  model: 'reMarkable 1' | 'reMarkable 2' | 'reMarkable Paper Pro';
}

export class RemarkableSSHClient {
  private config: SSHConnectionConfig;
  private connected = false;

  constructor(config: SSHConnectionConfig) {
    this.config = {
      port: 22,
      username: 'root',
      ...config,
    };
  }

  /**
   * Establish SSH connection to device
   */
  async connect(): Promise<void> {
    throw new Error('Not implemented - Phase 2.1');
    // TODO: Implement SSH connection
    // Use ssh2 library
    // Handle authentication
    // Verify connection
  }

  /**
   * Disconnect from device
   */
  async disconnect(): Promise<void> {
    throw new Error('Not implemented - Phase 2.1');
    // TODO: Close SSH connection
  }

  /**
   * Get device information
   */
  async getDeviceInfo(): Promise<DeviceInfo> {
    throw new Error('Not implemented - Phase 2.1');
    // TODO: Read device info files
    // /etc/version, /etc/remarkable.conf
  }

  /**
   * List all documents on device
   */
  async listDocuments(): Promise<string[]> {
    throw new Error('Not implemented - Phase 2.1');
    // TODO: List files in xochitl directory
    // Return document UUIDs
  }

  /**
   * Download document files from device
   */
  async downloadDocument(documentId: string): Promise<{
    metadata: Buffer;
    content: Buffer;
    pages: Buffer[];
  }> {
    throw new Error('Not implemented - Phase 2.1');
    // TODO: Download document files via SFTP
    // .metadata, .content, *.rm files
  }

  /**
   * Upload document files to device
   */
  async uploadDocument(
    documentId: string,
    files: {
      metadata: Buffer;
      content: Buffer;
      pages: Buffer[];
    }
  ): Promise<void> {
    throw new Error('Not implemented - Phase 2.1');
    // TODO: Upload files via SFTP
    // Trigger UI refresh
  }

  /**
   * Execute command on device
   */
  async exec(command: string): Promise<string> {
    throw new Error('Not implemented - Phase 2.1');
    // TODO: Execute SSH command
    // Return stdout
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}
