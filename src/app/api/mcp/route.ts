import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import { createMacroStackMcpServer } from '@/lib/mcp/server';

/**
 * MCP endpoint — Streamable HTTP transport.
 *
 * The SDK's web-standard transport takes a `Request` and returns a `Response`,
 * which is exactly a Next route handler's signature, so the MCP server mounts
 * in-app instead of needing a separate stdio process.
 *
 * Runs stateless (`sessionIdGenerator: undefined`) with a fresh server and
 * transport per request, since route handlers are not guaranteed to hit the
 * same instance twice.
 *
 * Point an MCP client at http://localhost:3000/api/mcp — e.g.
 *   npx @modelcontextprotocol/inspector
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  const server = createMacroStackMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  try {
    return await transport.handleRequest(request);
  } catch (error) {
    return Response.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal MCP transport error',
        },
        id: null,
      },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
