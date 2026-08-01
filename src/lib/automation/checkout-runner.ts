import fs from 'node:fs';
import path from 'node:path';

import { chromium, type Browser, type Page } from 'playwright';

import type { CheckoutExecutionPayload, CheckoutResult, SupplementProduct } from '@/types';
import type { MintedCard } from '@/lib/prava/sdk-client';
import { reportStatus } from '@/lib/prava/sdk-client';
import { revokeCard } from '@/lib/mock-merchant/store';

/**
 * Playwright checkout automation.
 *
 * Drives a real browser through the merchant's own checkout: selects Subscribe &
 * Save, fills contact and shipping, enters the Prava single-use credential, and
 * submits. Then it does the part that matters — retires the credential
 * immediately, so the subscription discount is captured but the recurring charge
 * that normally follows it cannot land.
 *
 * The merchant is our own simulated store, because the catalog products are
 * synthetic and there is no real listing to buy. Everything Prava does around it
 * is real. Swapping in a live merchant is a change of URL and selectors, not of
 * architecture — see `merchant-adapters.ts`.
 */

const SCREENSHOT_DIR = path.join(process.cwd(), 'public', 'demo-proof');

export interface CheckoutProgress {
  (step: string, detail?: Record<string, unknown>): void;
}

function screenshotPath(name: string): string {
  return path.join(SCREENSHOT_DIR, `${name}.png`);
}

async function capture(page: Page, name: string, onProgress?: CheckoutProgress): Promise<string | null> {
  try {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const file = screenshotPath(name);
    await page.screenshot({ path: file, fullPage: true });
    onProgress?.(`Captured ${name}`, { screenshot: `/demo-proof/${name}.png` });
    return `/demo-proof/${name}.png`;
  } catch {
    // A screenshot failure must never fail a checkout.
    return null;
  }
}

/** Builds the merchant product URL for one line item. */
function productUrl(baseUrl: string, product: SupplementProduct): string {
  const q = new URLSearchParams({
    product: product.productName,
    price: String(product.totalPriceUSD),
    discount: String(product.subscribeAndSaveDiscountPct),
  });
  return `${baseUrl}/mock-merchant?${q.toString()}`;
}

interface SingleCheckoutOutcome {
  product: SupplementProduct;
  success: boolean;
  orderId?: string;
  amountUSD: number;
  error?: string;
  screenshots: string[];
}

async function checkoutOne(
  browser: Browser,
  baseUrl: string,
  product: SupplementProduct,
  payload: CheckoutExecutionPayload,
  card: MintedCard,
  onProgress?: CheckoutProgress,
): Promise<SingleCheckoutOutcome> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const screenshots: string[] = [];
  const slug = product.id.replace(/[^a-z0-9]/gi, '_');

  try {
    onProgress?.(`Opening ${product.productName}`, { vendor: product.vendorName });
    await page.goto(productUrl(baseUrl, product), { waitUntil: 'domcontentloaded' });

    // Subscribe & Save is the entire point of the automation — it is where the
    // 10-20% comes from, and it is also what arms the recurring charge.
    const toggle = page.getByTestId('subscribe-save');
    if (!(await toggle.isChecked())) await toggle.check();
    onProgress?.('Selected Subscribe & Save', {
      discount: `${product.subscribeAndSaveDiscountPct}%`,
    });

    const shown = await page.getByTestId('total-price').textContent();
    const s1 = await capture(page, `${slug}_1_product`, onProgress);
    if (s1) screenshots.push(s1);

    await page.getByTestId('buy-now').click();
    await page.waitForURL('**/mock-merchant/checkout**');

    // Reconcile before paying. If the merchant's total doesn't match what the
    // card is capped at, stop rather than submit — an agent that pays a number
    // it didn't verify is the failure mode this whole product exists to avoid.
    const checkoutTotalText = (await page.getByTestId('checkout-total').textContent()) ?? '';
    const checkoutTotal = Number(checkoutTotalText.replace(/[^0-9.]/g, ''));
    const expected = product.discountedPriceUSD;

    if (!Number.isFinite(checkoutTotal) || Math.abs(checkoutTotal - expected) > 0.02) {
      throw new Error(
        `Total mismatch: merchant says $${checkoutTotal.toFixed(2)}, agent expected $${expected.toFixed(2)}. Refusing to pay.`,
      );
    }
    onProgress?.('Verified merchant total', {
      merchantTotal: `$${checkoutTotal.toFixed(2)}`,
      expected: `$${expected.toFixed(2)}`,
      productPageShowed: shown ?? undefined,
    });

    const { shippingAddress } = payload;
    await page.getByTestId('email').fill(shippingAddress.email);
    await page.getByTestId('full-name').fill(shippingAddress.fullName);
    await page.getByTestId('address').fill(shippingAddress.streetAddress);
    await page.getByTestId('city').fill(shippingAddress.city);
    await page.getByTestId('zip').fill(shippingAddress.zipCode);
    onProgress?.('Filled shipping details');

    await page.getByTestId('card-number').fill(card.cardNumber);
    await page.getByTestId('expiry').fill(`${card.expiryMonth}/${card.expiryYear.slice(-2)}`);
    await page.getByTestId('cvv').fill(card.cvv);
    onProgress?.('Entered Prava single-use credential', {
      card: `••••${card.cardNumber.slice(-4)}`,
      environment: card.environment,
    });

    const s2 = await capture(page, `${slug}_2_checkout`, onProgress);
    if (s2) screenshots.push(s2);

    await page.getByTestId('place-order').click();
    await page.waitForURL('**/mock-merchant/confirmation**');

    const orderId = (await page.getByTestId('order-id').textContent())?.trim();
    const s3 = await capture(page, `${slug}_3_confirmation`, onProgress);
    if (s3) screenshots.push(s3);

    onProgress?.(`Order placed: ${orderId}`, { amount: `$${expected.toFixed(2)}` });

    return { product, success: true, orderId, amountUSD: expected, screenshots };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const s = await capture(page, `${slug}_error`, onProgress);
    if (s) screenshots.push(s);
    onProgress?.(`Checkout failed for ${product.productName}`, { error: msg });
    return { product, success: false, amountUSD: product.discountedPriceUSD, error: msg, screenshots };
  } finally {
    await context.close();
  }
}

/**
 * Runs the full checkout for every product in the payload.
 *
 * The credential is retired in a `finally`, so it is retired even when a
 * checkout throws. A card left live after a failure is worse than a failed
 * order — it is exactly the standing authorization the user was trying to avoid.
 */
export async function executePlaywrightCheckout(
  payload: CheckoutExecutionPayload & { card?: MintedCard },
  onProgress?: CheckoutProgress,
): Promise<CheckoutResult> {
  const executionLogs: string[] = [];
  const log = (step: string, detail?: Record<string, unknown>) => {
    executionLogs.push(detail ? `${step} ${JSON.stringify(detail)}` : step);
    onProgress?.(step, detail);
  };

  const card = payload.card as MintedCard | undefined;
  if (!card) {
    return {
      success: false,
      merchantName: 'NutriMart (demo)',
      amountChargedUSD: 0,
      cardStatusAfterCheckout: 'FAILED',
      executionLogs: ['No Prava credential supplied — refusing to open a browser.'],
    };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000';
  const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';

  let browser: Browser | undefined;
  const outcomes: SingleCheckoutOutcome[] = [];

  try {
    log('Launching browser', { headless });
    browser = await chromium.launch({ headless });

    for (const product of payload.products) {
      outcomes.push(await checkoutOne(browser, baseUrl, product, payload, card, log));
    }
  } catch (error) {
    log('Automation error', { error: error instanceof Error ? error.message : String(error) });
  } finally {
    await browser?.close().catch(() => undefined);

    // Retire the credential no matter what happened above.
    revokeCard(card.cardNumber);
    log('Prava credential retired', {
      card: `••••${card.cardNumber.slice(-4)}`,
      effect: 'Subscription renewals against this card will now decline',
    });
  }

  const succeeded = outcomes.filter((o) => o.success);
  const amountChargedUSD = Number(succeeded.reduce((s, o) => s + o.amountUSD, 0).toFixed(2));
  const allOk = outcomes.length > 0 && succeeded.length === outcomes.length;

  // Settle with Prava. Skipping this leaves the transaction dangling on their
  // side, so it runs even when the checkout partially failed.
  try {
    await reportStatus(card.sessionId, card.txnRefId, allOk ? 'APPROVED' : 'DECLINED', {
      responseCode: allOk ? '00' : '05',
      amountPaidUSD: amountChargedUSD,
    });
    log('Reported outcome to Prava', {
      status: allOk ? 'APPROVED' : 'DECLINED',
      amount: `$${amountChargedUSD.toFixed(2)}`,
      environment: card.environment,
    });
  } catch (error) {
    log('Could not report status to Prava', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    success: allOk,
    orderId: succeeded.map((o) => o.orderId).filter(Boolean).join(', ') || undefined,
    merchantName: 'NutriMart (demo)',
    amountChargedUSD,
    cardStatusAfterCheckout: 'EXPIRED_SAFELY',
    executionLogs,
  };
}
