import { t } from '../i18n';

export type ProviderId = 'google' | 'yandex';
export type ProviderStatus = 'disconnected' | 'connecting' | 'connected' | 'syncing' | 'reconnect' | 'error';

export interface RemoteDocument {
  id: string;
  name: string;
  modifiedAt?: string;
  size?: number;
}
export interface ProviderStatusEvent {
  provider: ProviderId;
  status: ProviderStatus;
  message?: string;
}

export interface CloudProvider {
  readonly id: ProviderId;
  readonly label: string;
  readonly status: ProviderStatus;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  list(): Promise<RemoteDocument[]>;
  download(document: RemoteDocument): Promise<string>;
  upload(name: string, content: string): Promise<void>;
  delete(document: RemoteDocument): Promise<void>;
  subscribe(listener: (event: ProviderStatusEvent) => void): () => void;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: 'authorization' | 'network' | 'quota' | 'invalid-response' | 'configuration',
  ) {
    super(message);
  }
}

export abstract class BaseCloudProvider implements CloudProvider {
  abstract readonly id: ProviderId;
  abstract readonly label: string;
  protected currentStatus: ProviderStatus = 'disconnected';
  private readonly listeners = new Set<(event: ProviderStatusEvent) => void>();

  get status(): ProviderStatus {
    return this.currentStatus;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract list(): Promise<RemoteDocument[]>;
  abstract download(document: RemoteDocument): Promise<string>;
  abstract upload(name: string, content: string): Promise<void>;
  abstract delete(document: RemoteDocument): Promise<void>;

  subscribe(listener: (event: ProviderStatusEvent) => void): () => void {
    this.listeners.add(listener);
    listener({ provider: this.id, status: this.currentStatus });
    return () => this.listeners.delete(listener);
  }

  setSyncing(syncing: boolean): void {
    if (syncing && this.currentStatus === 'connected') this.setStatus('syncing');
    else if (!syncing && this.currentStatus === 'syncing') this.setStatus('connected');
  }

  protected setStatus(status: ProviderStatus, message?: string): void {
    this.currentStatus = status;
    const event = { provider: this.id, status, message };
    for (const listener of this.listeners) listener(event);
  }

  protected async response(response: Response, fallback: string): Promise<Response> {
    if (response.ok) return response;
    if (response.status === 401 || response.status === 403) {
      this.setStatus('reconnect', t('sync.needsReconnect'));
      throw new ProviderError(t('error.authorizationExpired'), 'authorization');
    }
    if (response.status === 429 || response.status === 507) {
      throw new ProviderError(t('error.cloudQuota'), 'quota');
    }
    let detail = '';
    try {
      detail = (await response.text()).slice(0, 300);
    } catch {
      // The status code is enough when the body cannot be read.
    }
    throw new ProviderError(`${fallback}: HTTP ${response.status}${detail ? ` — ${detail}` : ''}`, 'network');
  }
}
