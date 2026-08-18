import { describe, expect, it } from 'vitest';
import sourceHtml from '../index.html?raw';
import { injectYandexMetrika, YANDEX_METRIKA_ID } from '../vite.config';

describe('production analytics', () => {
  it('keeps Yandex Metrika out of the development HTML', () => {
    expect(sourceHtml).not.toContain('mc.yandex.ru');
    expect(sourceHtml).not.toContain(`ym(${YANDEX_METRIKA_ID}`);
  });

  it('injects the supplied counter and fallback pixel exactly once', () => {
    const html = injectYandexMetrika('<html><head></head><body><main></main></body></html>');
    const reinjected = injectYandexMetrika(html);

    expect(html).toContain(`https://mc.yandex.ru/metrika/tag.js?id=${YANDEX_METRIKA_ID}`);
    expect(html).toContain(
      `ym(${YANDEX_METRIKA_ID}, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});`,
    );
    expect(html).toContain(`https://mc.yandex.ru/watch/${YANDEX_METRIKA_ID}`);
    expect(html.indexOf('Yandex.Metrika counter')).toBeLessThan(html.indexOf('<main>'));
    expect(reinjected).toBe(html);
    expect(html.match(/metrika\/tag\.js/gu)).toHaveLength(1);
    expect(html.match(/mc\.yandex\.ru\/watch/gu)).toHaveLength(1);
  });
});
