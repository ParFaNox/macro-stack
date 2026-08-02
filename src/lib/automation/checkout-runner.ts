import fs from 'node:fs';
import path from 'node:path';

import { chromium, type Browser, type Page } from 'playwright';

import type { CheckoutExecutionPayload, CheckoutResult } from '@/types';
import { revokeSession } from '@/lib/prava/sdk-client';

/**
 * Drives an actual checkout against our own mock merchant (src/app/mock-merchant)
 * using the single-use Prava card handed in on `payload.cardDetails`, then
 * revokes the card immediately after.
 *
 * Catalog `checkoutUrl`s (src/lib/agent/catalog.ts) point at fake
 * `example-merchant.test` URLs that don't resolve — that file belongs to the
 * agent layer, so rather than edit it we translate every product straight to
 * its equivalent `/mock-merchant/p/{id}` page here, keyed by the same catalog id.
 *
 * `SupplementProduct.discountedPriceUSD` is always the Subscribe & Save price
 * (see optimizer-engine.ts) — every recommended product is already a
 * subscription line item, so Subscribe & Save is toggled unconditionally
 * rather than per-product.
 *
 * `cardDetails.cardId` carries the Prava session id, not a persistent card
 * id — Prava's disposable single-use tokens don't have one to revoke by
 * separately (see sdk-client.ts / the mint-card route that sets this field).
 */

export interface CheckoutRunnerOptions {
  headless?: boolean;
  screenshotDir?: string;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000';
}

export async function executePlaywrightCheckout(
  payload: CheckoutExecutionPayload,
  opts: CheckoutRunnerOptions = {},
): Promise<CheckoutResult> {
  const headless = opts.headless ?? process.env.PLAYWRIGHT_HEADLESS !== 'false';
  const screenshotDir = opts.screenshotDir ?? path.join(process.cwd(), 'public', 'demo-proof');
  fs.mkdirSync(screenshotDir, { recursive: true });

  const runId = `run_${Date.now()}`;
  const executionLogs: string[] = [];
  const log = (msg: string) => executionLogs.push(msg);

  const amountChargedUSD = Number(
    payload.products.reduce((sum, p) => sum + p.discountedPriceUSD, 0).toFixed(2),
  );
  const merchantName = payload.products[0]?.vendorName ?? 'Mock Merchant';
  const base = appUrl();

  let shotIndex = 0;
  const screenshot = async (page: Page, label: string) => {
    shotIndex += 1;
    const file = path.join(
      screenshotDir,
      `${runId}_${String(shotIndex).padStart(2, '0')}_${label}.png`,
    );
    await page.screenshot({ path: file, fullPage: true });
    log(`Screenshot: ${path.relative(process.cwd(), file)}`);
  };

  /** Revoking is best-effort but always attempted, success or failure. */
  const revoke = async (): Promise<CheckoutResult['cardStatusAfterCheckout']> => {
    try {
      await revokeSession(payload.cardDetails.cardId);
      log(`Revoked Prava session ${payload.cardDetails.cardId} — card expired`);
      return 'EXPIRED_SAFELY';
    } catch (err) {
      log(`Failed to revoke Prava session: ${err instanceof Error ? err.message : String(err)}`);
      return 'FAILED';
    }
  };

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless });
    const context = await browser.newContext();
    const page = await context.newPage();
    log(`Launched Chromium (headless=${headless})`);

    for (const product of payload.products) {
      const url = `${base}/mock-merchant/p/${product.id}`;
      await page.goto(url, { waitUntil: 'networkidle' });
      log(`Navigated to ${url}`);

      await page.check('input[name="subscribeAndSave"]');
      log(`Selected Subscribe & Save for ${product.productName}`);

      await screenshot(page, `product_${product.id}`);

      await Promise.all([
        page.waitForURL(/added=1/),
        page.click('button:has-text("Add to Cart")'),
      ]);
      log(`Added ${product.productName} to cart`);
    }

    await page.goto(`${base}/mock-merchant/checkout`, { waitUntil: 'networkidle' });
    log('Navigated to checkout');

    const addr = payload.shippingAddress;
    await page.fill('input[name="fullName"]', addr.fullName);
    await page.fill('input[name="email"]', addr.email);
    await page.fill('input[name="streetAddress"]', addr.streetAddress);
    await page.fill('input[name="city"]', addr.city);
    await page.fill('input[name="state"]', addr.state);
    await page.fill('input[name="zipCode"]', addr.zipCode);

    const card = payload.cardDetails;
    await page.fill('input[name="cardNumber"]', card.cardNumber);
    await page.fill('input[name="expiryMonth"]', card.expiryMonth);
    await page.fill('input[name="expiryYear"]', card.expiryYear);
    await page.fill('input[name="cvv"]', card.cvv);
    log('Filled shipping address and card details');

    await screenshot(page, 'checkout_filled');

    await Promise.all([
      page.waitForURL(/\/mock-merchant\/order\//),
      page.click('button:has-text("Place order")'),
    ]);

    const orderId = new URL(page.url()).pathname.split('/').pop();
    log(`Order placed: ${orderId}`);

    await screenshot(page, 'order_confirmation');

    await context.close();
    await browser.close();
    browser = undefined;

    const cardStatusAfterCheckout = await revoke();

    return {
      success: true,
      orderId,
      merchantName,
      amountChargedUSD,
      cardStatusAfterCheckout,
      executionLogs,
    };
  } catch (error) {
    log(`Checkout failed: ${error instanceof Error ? error.message : String(error)}`);
    await revoke();

    return {
      success: false,
      merchantName,
      amountChargedUSD,
      cardStatusAfterCheckout: 'FAILED',
      executionLogs,
    };
  } finally {
    if (browser) await browser.close();
  }
}
