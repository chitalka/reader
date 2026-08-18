import { defineConfig, type Plugin } from 'vitest/config';

const STATIC_PWA_FILES = [
  './manifest.webmanifest',
  './manifest.ru.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

export const YANDEX_METRIKA_ID = 111720126;

const YANDEX_METRIKA_SNIPPET = `<!-- Yandex.Metrika counter -->
<script type="text/javascript">
    (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=111720126', 'ym');

    ym(111720126, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/111720126" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
<!-- /Yandex.Metrika counter -->`;

export function injectYandexMetrika(html: string): string {
  if (html.includes(`mc.yandex.ru/watch/${YANDEX_METRIKA_ID}`)) return html;
  const snippet = YANDEX_METRIKA_SNIPPET
    .split('\n')
    .map((line) => line ? `    ${line}` : line)
    .join('\n');
  return html.replace('<body>', `<body>\n${snippet}`);
}

function yandexMetrika(): Plugin {
  return {
    name: 'chitalka-yandex-metrika',
    apply: 'build',
    transformIndexHtml: injectYandexMetrika,
  };
}

function hashText(hash: number, text: string): number {
  let next = hash;
  for (let index = 0; index < text.length; index += 1) {
    next ^= text.charCodeAt(index);
    next = Math.imul(next, 0x01000193);
  }
  return next >>> 0;
}

function serviceWorkerSource(cacheVersion: string, files: string[]): string {
  return `const CACHE_PREFIX = 'chitalka-shell-';
const CACHE_NAME = CACHE_PREFIX + '${cacheVersion}';
const PRECACHE = ${JSON.stringify(files)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request))
      || (await cache.match(new URL('./', self.registration.scope).href))
      || Response.error();
  }
}

async function networkFirstAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

async function cachedAsset(event) {
  const request = event.request;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const refresh = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  });

  if (!cached) return refresh;
  event.waitUntil(refresh.then(() => undefined).catch(() => undefined));
  return cached;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const mutablePwaAsset = url.pathname.endsWith('.webmanifest')
    || url.pathname.includes('/icons/');

  event.respondWith(
    request.mode === 'navigate'
      ? networkFirstPage(request)
      : mutablePwaAsset
        ? networkFirstAsset(request)
        : cachedAsset(event).catch(async () => (await caches.match(request)) || Response.error()),
  );
});
`;
}

function offlineAppShell(): Plugin {
  return {
    name: 'chitalka-offline-app-shell',
    apply: 'build',
    generateBundle(_options, bundle) {
      const outputNames = Object.keys(bundle).sort();
      let hash = 0x811c9dc5;
      for (const name of outputNames) {
        const output = bundle[name];
        const contents = output.type === 'asset'
          ? typeof output.source === 'string'
            ? output.source
            : new TextDecoder().decode(output.source)
          : output.code;
        hash = hashText(hashText(hash, name), contents);
      }

      const bundledFiles = outputNames
        .filter((name) => name !== 'index.html' && !name.endsWith('.map'))
        .map((name) => `./${name}`);
      const precache = ['./', ...STATIC_PWA_FILES, ...bundledFiles];

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorkerSource(hash.toString(16).padStart(8, '0'), precache),
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [yandexMetrika(), offlineAppShell()],
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    include: ['src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
