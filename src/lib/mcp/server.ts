import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  auditSupplementLabel,
  auditSupplementLabelInput,
  calculateTrueCost,
  calculateTrueCostInput,
  evaluateIngredientPurity,
  evaluateIngredientPurityInput,
} from '@/lib/agent/mcp-tools';
import { SUPPLEMENT_CATALOG } from '@/lib/agent/catalog';

/**
 * MacroStack MCP server.
 *
 * Exposes the label-audit toolchain over Model Context Protocol so any MCP
 * client (Claude Desktop, MCP Inspector, another agent) can drive the auditor
 * directly rather than going through the app's HTTP API.
 *
 * Built fresh per request by the /api/mcp route handler: the transport runs in
 * stateless mode, so sharing one instance across requests would leak state
 * between unrelated clients.
 */

function ok(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

function fail(error: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: error instanceof Error ? error.message : String(error),
      },
    ],
    isError: true,
  };
}

export function createMacroStackMcpServer(): McpServer {
  const server = new McpServer({
    name: 'macrostack-label-auditor',
    version: '0.1.0',
  });

  server.registerTool(
    'audit_supplement_label',
    {
      title: 'Audit supplement label',
      description:
        'Read a supplement facts panel image and extract active ingredients, grams per ' +
        'serving, purity, servings per container and any deceptive-labelling flags. Falls ' +
        'back to a deterministic offline audit when no vision API key is configured; the ' +
        '"source" field in the result says which path ran.',
      inputSchema: auditSupplementLabelInput,
    },
    async ({ labelImageUrl }) => {
      try {
        return ok(await auditSupplementLabel({ labelImageUrl }));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'evaluate_ingredient_purity',
    {
      title: 'Evaluate ingredient purity',
      description:
        'Given a list of active ingredients (and optionally the full serving size in ' +
        'grams), compute how much of a serving is genuinely active compound versus ' +
        'filler, and grade the formula A-F.',
      inputSchema: evaluateIngredientPurityInput,
    },
    async (args) => {
      try {
        return ok(evaluateIngredientPurity(args));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'calculate_true_cost',
    {
      title: 'Calculate true cost per active gram',
      description:
        'Compute USD per gram of pure active ingredient — the honest way to compare ' +
        'supplements, since sticker price ignores filler and serving count. Pass a seed ' +
        `catalog productId (one of: ${SUPPLEMENT_CATALOG.map((e) => e.id).join(', ')}) or ` +
        'the explicit price/servings/ingredients fields. Also reports the Subscribe & Save ' +
        'discounted cost per gram when a discount percentage is supplied.',
      inputSchema: calculateTrueCostInput,
    },
    async (args) => {
      try {
        return ok(calculateTrueCost(args));
      } catch (error) {
        return fail(error);
      }
    },
  );

  return server;
}
