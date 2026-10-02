/**
 * Values published by Canva's OAuth discovery documents.
 * Fetched from:
 * - https://mcp.canva.com/.well-known/oauth-authorization-server
 * - https://mcp.canva.com/.well-known/oauth-protected-resource/mcp
 *
 * Do not add endpoints or scopes that those documents do not list.
 */

export const CANVA_MCP_SERVER = "https://mcp.canva.com/mcp";
export const CANVA_AUTHORIZATION_ENDPOINT = "https://mcp.canva.com/authorize";
export const CANVA_TOKEN_ENDPOINT = "https://mcp.canva.com/token";
export const CANVA_RESOURCE = "https://mcp.canva.com/mcp";

/** MCP protocol version sent on initialize. The server may answer with its own. */
export const MCP_PROTOCOL_VERSION = "2025-03-26";

/**
 * Scopes advertised on the MCP protected-resource metadata.
 * Phase 2 only asks for the design read/write scopes plus profile, which that document lists.
 */
export const CANVA_SCOPES = [
  "profile:read",
  "design:meta:read",
  "design:content:read",
  "design:content:write",
] as const;

export const CANVA_DOCS = {
  quickstart: "https://www.canva.dev/docs/apps/quickstart/",
  access: "https://www.canva.dev/docs/apps/mcp/access/",
  generateDesign: "https://www.canva.dev/docs/apps/mcp/tools/generate-design/",
  createDesign: "https://www.canva.dev/docs/connect/mcp-server/tools/create-design/",
  createFromCandidate: "https://www.canva.dev/docs/apps/mcp/tools/create-design-from-candidate/",
  waitlist: "https://docs.google.com/forms/d/1jgC4vAA2-5LqaNzVhnP8ygSknF4Vysc1UzAWJukzcp0/viewform",
} as const;

export const SELF_SERVICE_NOTE =
  "Developer Portal の Canva MCP 自己発行は、公式ドキュメント上「まだ使えない」と書かれています。クライアントIDが取れないときは、同じページのウェイトリストに申請します。";
