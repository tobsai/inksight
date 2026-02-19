/**
 * Type definitions for reMarkable device access layer.
 */

export interface SSHConnectionOptions {
  /** Device host — typically 10.11.99.1 (USB) or device IP (Wi-Fi) */
  host: string;
  /** SSH port. Default: 22 */
  port?: number;
  /** SSH username. Default: 'root' */
  username?: string;
  /** SSH password. reMarkable default is empty string unless user-set */
  password?: string;
  /** Path to SSH private key (alternative to password) */
  privateKeyPath?: string;
  /** Connection timeout in ms. Default: 10000 */
  connectTimeoutMs?: number;
  /** Keep-alive interval in ms. Default: 30000 */
  keepAliveIntervalMs?: number;
}

export interface RemoteFile {
  /** Full remote path */
  path: string;
  /** Filename only */
  name: string;
  /** File size in bytes */
  size: number;
  /** True if this entry is a directory */
  isDirectory: boolean;
  /** Last-modified timestamp */
  modifiedAt: Date;
}

export interface DeviceInfo {
  /** Device model, e.g. "reMarkable Paper Pro" */
  model: string;
  /** Firmware version string */
  firmware: string;
  /** Device serial number */
  serial: string;
}

export interface DocumentChange {
  documentId: string;
  changedAt: Date;
  changeType: 'created' | 'modified' | 'deleted';
}
