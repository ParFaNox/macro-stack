import { z } from 'zod';

import type { AuditLabelResponse } from '@/types/agent';
import { ReasoningLogCollector } from '@/lib/agent/logger';
import { activeGramsPerServing } from '@/lib/agent/optimizer-engine';
import { auditNutritionLabel, hasVisionKey, visionModelId } from '@/lib/agent/vision-auditor';

/**
 * POST /api/audit-label
 *
 * Accepts either:
 *   - JSON `{ "imageUrl": "https://..." | "data:image/..." }`
 *   - multipart/form-data with an `image` file field (converted to a data URI)
 *
 * Returns the structured label audit plus its reasoning logs.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const JsonSchema = z.object({
  imageUrl: z.string().min(1, 'imageUrl is required'),
});

export async function GET() {
  return Response.json({
    endpoint: '/api/audit-label',
    method: 'POST',
    accepts: ['application/json { imageUrl }', 'multipart/form-data { image }'],
    visionMode: hasVisionKey() ? 'LIVE_VISION_MODEL' : 'DETERMINISTIC_MOCK',
    ...(hasVisionKey() ? { model: visionModelId() } : {}),
  });
}

async function resolveImageUrl(request: Request): Promise<string> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('image');

    if (!(file instanceof File)) {
      throw new Error('multipart/form-data request must include an "image" file field');
    }
    if (file.size === 0) {
      throw new Error('Uploaded image is empty');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(`Image exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024}MB upload limit`);
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    return `data:${file.type || 'image/jpeg'};base64,${base64}`;
  }

  const body = await request.json();
  const parsed = JsonSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join('; '));
  }
  return parsed.data.imageUrl;
}

export async function POST(request: Request) {
  let imageUrl: string;
  try {
    imageUrl = await resolveImageUrl(request);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not read request body' },
      { status: 400 },
    );
  }

  const logs = new ReasoningLogCollector();
  // Data URIs are enormous; never put one in a log message.
  const displayUrl = imageUrl.startsWith('data:')
    ? `<uploaded image, ${Math.round(imageUrl.length / 1024)}KB>`
    : imageUrl;

  logs.push('LABEL_AUDIT', 'INFO', 'Reading supplement facts panel', {
    image: displayUrl,
    mode: hasVisionKey() ? 'LIVE_VISION_MODEL' : 'DETERMINISTIC_MOCK',
    ...(hasVisionKey() ? { model: visionModelId() } : {}),
  });

  try {
    const audit = await auditNutritionLabel(imageUrl);

    logs.push(
      'LABEL_AUDIT',
      audit.fillerCallouts.length > 0 ? 'WARNING' : 'SUCCESS',
      audit.fillerCallouts.length > 0
        ? `Extracted ${audit.activeIngredients.length} active ingredient(s) — deceptive labelling detected`
        : `Extracted ${audit.activeIngredients.length} active ingredient(s) — label is clean`,
      {
        source: audit.source,
        ...(audit.modelId ? { model: audit.modelId } : {}),
        servingsPerContainer: audit.servingsPerContainer,
        activeGramsPerServing: Number(activeGramsPerServing(audit.activeIngredients).toFixed(2)),
        fillerPercentage: audit.fillerPercentage,
        confidence: audit.confidence,
        ...(audit.fillerCallouts.length > 0 ? { flags: audit.fillerCallouts } : {}),
        ...(audit.notes ? { notes: audit.notes } : {}),
      },
    );

    const response: AuditLabelResponse = { audit, reasoningLogs: logs.all() };
    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Label audit failed';
    logs.push('LABEL_AUDIT', 'ERROR', message, { image: displayUrl });
    return Response.json({ error: message, reasoningLogs: logs.all() }, { status: 500 });
  }
}
