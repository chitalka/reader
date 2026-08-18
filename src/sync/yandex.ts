import { BaseCloudProvider, ProviderError, type RemoteDocument } from './provider';
import { t } from '../i18n';

interface YandexCallbackMessage {
  type: 'chitalka:yandex-oauth';
  code?: string | null;
  state?: string | null;
  error?: string | null;
  errorDescription?: string | null;
}
const YANDEX_AUTHORIZE = 'https://oauth.yandex.ru/authorize';
const YANDEX_TOKEN = 'https://oauth.yandex.ru/token';
const DISK_API = 'https://cloud-api.yandex.net/v1/disk';

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function randomToken(length = 48): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(length)));
}

export class YandexDiskProvider extends BaseCloudProvider {
  readonly id = 'yandex' as const;
  get label(): string {
    return t('sync.yandex');
  }
  private accessToken?: string;
  private expiresAt = 0;

  constructor(private readonly clientId: string | undefined = import.meta.env.VITE_YANDEX_CLIENT_ID) {
    super();
  }

  async connect(): Promise<void> {
    if (!this.clientId) {
      this.setStatus('error', t('sync.clientIdRequired'));
      throw new ProviderError(t('error.clientIdMissing', {
        provider: t('sync.yandex'),
        variable: 'VITE_YANDEX_CLIENT_ID',
      }), 'configuration');
    }
    this.setStatus('connecting');
    const state = randomToken(24);
    const verifier = randomToken();
    const challenge = await pkceChallenge(verifier);
    const redirectUri = new URL('oauth/yandex-callback.html', document.baseURI).href;
    const authorize = new URL(YANDEX_AUTHORIZE);
    authorize.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: 'cloud_api:disk.app_folder',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();

    const popup = window.open(
      authorize,
      'chitalka-yandex-oauth',
      'popup=yes,width=520,height=720,resizable=yes,scrollbars=yes',
    );
    if (!popup) {
      this.setStatus('error', t('error.popupBlocked'));
      throw new ProviderError(t('error.allowPopup', { provider: t('sync.yandex') }), 'authorization');
    }

    try {
      const code = await this.waitForCode(popup, state);
      const response = await fetch(YANDEX_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: this.clientId,
          code_verifier: verifier,
          redirect_uri: redirectUri,
        }),
      });
      const result = await response.json() as {
        access_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
      };
      if (!response.ok || !result.access_token) {
        throw new ProviderError(
          result.error_description || result.error || t('error.yandexNoToken'),
          'authorization',
        );
      }
      this.accessToken = result.access_token;
      this.expiresAt = result.expires_in
        ? Date.now() + Math.max(0, result.expires_in - 30) * 1000
        : Number.POSITIVE_INFINITY;
      this.setStatus('connected');
    } catch (error) {
      popup.close();
      this.setStatus('error', error instanceof Error ? error.message : t('error.connection'));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.accessToken = undefined;
    this.expiresAt = 0;
    this.setStatus('disconnected');
  }

  async list(): Promise<RemoteDocument[]> {
    const parameters = new URLSearchParams({ path: 'app:/', limit: '1000', fields: '_embedded.items.name,_embedded.items.path,_embedded.items.modified,_embedded.items.size' });
    const response = await this.response(await fetch(`${DISK_API}/resources?${parameters}`, {
      headers: { Authorization: `OAuth ${this.token()}` },
    }), t('error.yandexList'));
    const body = await response.json() as {
      _embedded?: { items?: Array<{ name: string; path: string; modified?: string; size?: number }> };
    };
    return (body._embedded?.items ?? [])
      .filter((item) => item.name.startsWith('chitalka-v1-'))
      .map((item) => ({
        id: item.path,
        name: item.name,
        modifiedAt: item.modified,
        size: item.size,
      }));
  }

  async download(document: RemoteDocument): Promise<string> {
    const parameters = new URLSearchParams({ path: document.id });
    const linkResponse = await this.response(await fetch(`${DISK_API}/resources/download?${parameters}`, {
      headers: { Authorization: `OAuth ${this.token()}` },
    }), t('error.yandexDownloadLink'));
    const link = await linkResponse.json() as { href?: string };
    if (!link.href) throw new ProviderError(t('error.yandexNoDownloadLink'), 'invalid-response');
    const response = await fetch(link.href);
    if (!response.ok) throw new ProviderError(t('error.snapshotDownload', { status: response.status }), 'network');
    return response.text();
  }

  async upload(name: string, content: string): Promise<void> {
    const parameters = new URLSearchParams({ path: `app:/${name}`, overwrite: 'false' });
    const linkResponse = await this.response(await fetch(`${DISK_API}/resources/upload?${parameters}`, {
      headers: { Authorization: `OAuth ${this.token()}` },
    }), t('error.yandexUploadLink'));
    const link = await linkResponse.json() as { href?: string; method?: string };
    if (!link.href) throw new ProviderError(t('error.yandexNoUploadLink'), 'invalid-response');
    const response = await fetch(link.href, {
      method: link.method ?? 'PUT',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: content,
    });
    if (!response.ok) throw new ProviderError(t('error.snapshotUpload', { status: response.status }), 'network');
  }

  async delete(document: RemoteDocument): Promise<void> {
    const parameters = new URLSearchParams({ path: document.id, permanently: 'true' });
    await this.response(await fetch(`${DISK_API}/resources?${parameters}`, {
      method: 'DELETE',
      headers: { Authorization: `OAuth ${this.token()}` },
    }), t('error.yandexDelete'));
  }

  private token(): string {
    if (!this.accessToken || Date.now() >= this.expiresAt) {
      this.accessToken = undefined;
      this.setStatus('reconnect', t('sync.needsReconnect'));
      throw new ProviderError(t('error.yandexTokenExpired'), 'authorization');
    }
    return this.accessToken;
  }

  private waitForCode(popup: Window, expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => finish(new ProviderError(t('error.authorizationTimeout'), 'authorization')), 5 * 60_000);
      const closedPoll = window.setInterval(() => {
        if (popup.closed) finish(new ProviderError(t('error.authorizationClosed'), 'authorization'));
      }, 400);
      const onMessage = (event: MessageEvent<YandexCallbackMessage>): void => {
        if (event.origin !== location.origin || event.source !== popup) return;
        const message = event.data;
        if (message?.type !== 'chitalka:yandex-oauth') return;
        if (message.state !== expectedState) {
          finish(new ProviderError(t('error.oauthState'), 'authorization'));
          return;
        }
        if (message.error || !message.code) {
          finish(new ProviderError(
            message.errorDescription || message.error || t('error.authorizationCancelled'),
            'authorization',
          ));
          return;
        }
        finish(undefined, message.code);
      };
      const finish = (error?: Error, code?: string): void => {
        window.clearTimeout(timeout);
        window.clearInterval(closedPoll);
        window.removeEventListener('message', onMessage);
        if (error) reject(error);
        else resolve(code!);
      };
      window.addEventListener('message', onMessage);
    });
  }
}
