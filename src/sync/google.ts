import { BaseCloudProvider, ProviderError, type RemoteDocument } from './provider';

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface GoogleTokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: { type?: string }) => void;
          }): GoogleTokenClient;
          revoke(token: string, callback?: () => void): void;
        };
      };
    };
  }
}

const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

let googleScriptPromise: Promise<void> | undefined;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  googleScriptPromise ??= new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Не удалось загрузить Google Identity Services')), {
        once: true,
      });
      return;
    }
    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT;
    script.async = true;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Не удалось загрузить Google Identity Services')), {
      once: true,
    });
    document.head.append(script);
  });
  return googleScriptPromise;
}

export class GoogleDriveProvider extends BaseCloudProvider {
  readonly id = 'google' as const;
  readonly label = 'Google Drive';
  private accessToken?: string;
  private expiresAt = 0;

  constructor(private readonly clientId: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID) {
    super();
  }

  async connect(): Promise<void> {
    if (!this.clientId) {
      this.setStatus('error', 'Не задан Client ID');
      throw new ProviderError('Для Google Drive не задан VITE_GOOGLE_CLIENT_ID', 'configuration');
    }
    this.setStatus('connecting');
    try {
      await loadGoogleScript();
      const oauth = window.google?.accounts.oauth2;
      if (!oauth) throw new ProviderError('Google Identity Services не загрузился', 'network');
      const response = await new Promise<GoogleTokenResponse>((resolve, reject) => {
        const client = oauth.initTokenClient({
          client_id: this.clientId!,
          scope: DRIVE_SCOPE,
          callback: resolve,
          error_callback: (error) => reject(new ProviderError(
            `Google OAuth не завершён${error.type ? `: ${error.type}` : ''}`,
            'authorization',
          )),
        });
        client.requestAccessToken({ prompt: '' });
      });
      if (!response.access_token || response.error) {
        throw new ProviderError(
          response.error_description || response.error || 'Google не выдал токен',
          'authorization',
        );
      }
      this.accessToken = response.access_token;
      this.expiresAt = Date.now() + Math.max(0, (response.expires_in ?? 3600) - 30) * 1000;
      this.setStatus('connected');
    } catch (error) {
      this.setStatus('error', error instanceof Error ? error.message : 'Ошибка подключения');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const token = this.accessToken;
    this.accessToken = undefined;
    this.expiresAt = 0;
    this.setStatus('disconnected');
    if (token && window.google?.accounts.oauth2) {
      await new Promise<void>((resolve) => window.google!.accounts.oauth2.revoke(token, resolve));
    }
  }

  async list(): Promise<RemoteDocument[]> {
    const token = this.token();
    const result: RemoteDocument[] = [];
    let pageToken: string | undefined;
    do {
      const parameters = new URLSearchParams({
        spaces: 'appDataFolder',
        pageSize: '1000',
        fields: 'nextPageToken,files(id,name,modifiedTime,size)',
        q: "trashed = false and name contains 'chitalka-v1-'",
      });
      if (pageToken) parameters.set('pageToken', pageToken);
      const response = await this.response(await fetch(`${DRIVE_API}/files?${parameters}`, {
        headers: { Authorization: `Bearer ${token}` },
      }), 'Не удалось получить данные Google Drive');
      const body = await response.json() as {
        nextPageToken?: string;
        files?: Array<{ id: string; name: string; modifiedTime?: string; size?: string }>;
      };
      result.push(...(body.files ?? []).map((file) => ({
        id: file.id,
        name: file.name,
        modifiedAt: file.modifiedTime,
        size: file.size ? Number(file.size) : undefined,
      })));
      pageToken = body.nextPageToken;
    } while (pageToken);
    return result;
  }

  async download(document: RemoteDocument): Promise<string> {
    const response = await this.response(await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(document.id)}?alt=media`,
      { headers: { Authorization: `Bearer ${this.token()}` } },
    ), 'Не удалось скачать снимок Google Drive');
    return response.text();
  }

  async upload(name: string, content: string): Promise<void> {
    const boundary = `chitalka_${crypto.randomUUID().replaceAll('-', '')}`;
    const metadata = JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/json' });
    const body = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n`,
      `--${boundary}--`,
    ].join('');
    await this.response(await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token()}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    ), 'Не удалось загрузить снимок в Google Drive');
  }

  async delete(document: RemoteDocument): Promise<void> {
    await this.response(await fetch(`${DRIVE_API}/files/${encodeURIComponent(document.id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.token()}` },
    }), 'Не удалось удалить старый снимок Google Drive');
  }

  private token(): string {
    if (!this.accessToken || Date.now() >= this.expiresAt) {
      this.accessToken = undefined;
      this.setStatus('reconnect', 'Нужно переподключить');
      throw new ProviderError('Токен Google Drive истёк', 'authorization');
    }
    return this.accessToken;
  }
}
