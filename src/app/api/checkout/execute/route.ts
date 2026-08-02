import { z } from 'zod';

import type { CheckoutExecutionPayload } from '@/types';
import { executePlaywrightCheckout } from '@/lib/automation/checkout-runner';

/**
 * POST /api/checkout/execute
 *
 * Body: CheckoutExecutionPayload  →  Returns: CheckoutResult
 *
 * Runs the Playwright automation against the mock merchant and revokes the
 * Prava card once done. Playwright and the Prava secret key can't run on
 * edge, hence nodejs runtime.
 */

export const runtime = 'nodejs';

const ActiveIngredientSchema = z.object({
  name: z.string(),
  amountPerServingGrams: z.number(),
  purityPercentage: z.number(),
});

const ProductSchema = z.object({
  id: z.string().min(1),
  brand: z.string(),
  productName: z.string(),
  imageUrl: z.string(),
  labelImageUrl: z.string(),
  totalPriceUSD: z.number(),
  servingsPerContainer: z.number(),
  activeIngredients: z.array(ActiveIngredientSchema),
  costPerGramActiveUSD: z.number(),
  subscribeAndSaveDiscountPct: z.number(),
  discountedPriceUSD: z.number(),
  checkoutUrl: z.string(),
  vendorName: z.string(),
});

const RequestSchema = z.object({
  products: z.array(ProductSchema).min(1),
  shippingAddress: z.object({
    fullName: z.string().min(1),
    streetAddress: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    zipCode: z.string().min(1),
    email: z.string().email(),
  }),
  cardDetails: z.object({
    cardId: z.string().min(1),
    cardNumber: z.string().min(1),
    expiryMonth: z.string().min(1),
    expiryYear: z.string().min(1),
    cvv: z.string().min(1),
    cardHolderName: z.string(),
    billingZip: z.string(),
    isSingleUse: z.boolean(),
    status: z.enum(['ACTIVE', 'EXPIRED', 'BLOCKED']),
  }),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: 'Invalid CheckoutExecutionPayload',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 },
    );
  }

  try {
    const result = await executePlaywrightCheckout(parsed.data as CheckoutExecutionPayload);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Checkout automation failed' },
      { status: 500 },
    );
  }
}
