import { writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures';
import { FAST_4G, FAST_4G_SOURCE, initialInteractionPasses } from '../tools/perf/cold-load';

interface ResponseObservation {
  requestId: string;
  url: string;
  status: number;
  fromDiskCache: boolean;
  fromServiceWorker: boolean;
  fromPrefetchCache: boolean;
  contentEncoding: string | null;
  encodedBytes: number;
}

// Only the separate cold-load config collects these serial, fresh-context experiments.
test.describe('cold Fast4G title interaction; local preview is not Pages acceptance', () => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    test(`fresh context ${attempt}: trusted new-game input within3000ms`, async ({
      page,
    }, info) => {
      test.skip(
        info.config.metadata.coldLoad !== true,
        'Requires the dedicated serial cold-load config; ordinary parallel smoke runs are not load timing evidence.',
      );
      const cdp = await page.context().newCDPSession(page);
      const responses = new Map<string, ResponseObservation>();
      const servedFromCache = new Set<string>();
      cdp.on('Network.requestServedFromCache', (event: { requestId: string }) =>
        servedFromCache.add(event.requestId),
      );
      cdp.on(
        'Network.responseReceived',
        (event: {
          requestId: string;
          response: {
            url: string;
            status: number;
            fromDiskCache?: boolean;
            fromServiceWorker?: boolean;
            fromPrefetchCache?: boolean;
            headers: Record<string, string>;
            encodedDataLength: number;
          };
        }) => {
          const headers = Object.fromEntries(
            Object.entries(event.response.headers).map(([key, value]) => [
              key.toLowerCase(),
              value,
            ]),
          );
          responses.set(event.requestId, {
            requestId: event.requestId,
            url: event.response.url,
            status: event.response.status,
            fromDiskCache: event.response.fromDiskCache ?? false,
            fromServiceWorker: event.response.fromServiceWorker ?? false,
            fromPrefetchCache: event.response.fromPrefetchCache ?? false,
            contentEncoding: headers['content-encoding'] ?? null,
            encodedBytes: event.response.encodedDataLength,
          });
        },
      );
      cdp.on(
        'Network.loadingFinished',
        (event: { requestId: string; encodedDataLength: number }) => {
          const response = responses.get(event.requestId);
          if (response) response.encodedBytes = event.encodedDataLength;
        },
      );
      await cdp.send('Network.enable');
      await cdp.send('Network.clearBrowserCache');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.setBypassServiceWorker', { bypass: true });
      await cdp.send('Network.emulateNetworkConditions', FAST_4G);
      await page.addInitScript(() => {
        document.addEventListener(
          'click',
          (event) => {
            if (
              event.isTrusted &&
              event.target instanceof Element &&
              event.target.closest('[data-testid="title-newgame"]')
            ) {
              document.documentElement.dataset.tenkaColdTrustedClickMs = String(performance.now());
              document.documentElement.dataset.tenkaColdFontStatus = document.fonts.status;
            }
          },
          { capture: true },
        );
      });
      let clickedAtMs: number | null = null;
      let fontsAtClick: string | null = null;
      let scenarioScreenAccepted = false;
      try {
        const response = await page.goto('./', { waitUntil: 'domcontentloaded' });
        expect(response?.status()).toBe(200);
        await expect(page.getByTestId('screen-title')).toBeVisible();
        await page.getByTestId('title-newgame').click();
        const observation = await page.evaluate(() => ({
          click: document.documentElement.dataset.tenkaColdTrustedClickMs,
          fonts: document.documentElement.dataset.tenkaColdFontStatus,
        }));
        clickedAtMs = observation.click === undefined ? null : Number(observation.click);
        fontsAtClick = observation.fonts ?? null;
        await expect(page.getByTestId('screen-scenario-select')).toBeVisible();
        scenarioScreenAccepted = true;
        expect(servedFromCache.size).toBe(0);
        expect(
          [...responses.values()].some(
            (item) => item.fromDiskCache || item.fromServiceWorker || item.fromPrefetchCache,
          ),
        ).toBe(false);
        expect(clickedAtMs).not.toBeNull();
        expect(initialInteractionPasses(clickedAtMs ?? Number.NaN)).toBe(true);
      } finally {
        const target = new URL(info.project.use.baseURL ?? 'http://localhost:4181');
        const path = info.outputPath(`cold-load-${attempt}.json`);
        await writeFile(
          path,
          JSON.stringify(
            {
              attempt,
              scope: ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
                ? 'local-preview-diagnostic/not-Pages-acceptance'
                : 'external-host/release-candidate-identity-needs-verification',
              target: target.href,
              profile: FAST_4G,
              profileSource: FAST_4G_SOURCE,
              browser: page.context().browser()?.version(),
              clickedAtMs,
              fontsAtClick,
              scenarioScreenAccepted,
              servedFromCache: [...servedFromCache],
              responses: [...responses.values()],
            },
            null,
            2,
          ),
        );
        await info.attach('cold-load-observations', { path, contentType: 'application/json' });
        await cdp.detach();
      }
    });
  }
});
