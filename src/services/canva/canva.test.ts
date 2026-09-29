import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { DesignEvaluator } from "@/services/agents/design-evaluator";
import { IterationManager } from "@/services/agents/iteration-manager";
import { StyleProfileManager } from "@/services/agents/style-profile-manager";
import { browserOrigin } from "./config";
import { buildAuthorizationUrl, readTokenResponse, refreshTokenBody } from "./oauth";
import { codeChallengeS256 } from "./pkce";
import { isAllowedCanvaHost, parseMcpMessage, readDesignSummary, readGeneratedDesigns } from "./parse";
import { statusFrom } from "./public";
import { buildCreateArguments, buildGenerateArguments } from "./schema";
import { createSessionStore } from "./store";
import { fetchCanvaThumbnail } from "./thumbnail";

describe("Canva OAuth request", () => {
  it("asks for the published code flow with S256 and does not put the secret in the URL", () => {
    const url = new URL(
      buildAuthorizationUrl({
        clientId: "client-123",
        redirectUri: "http://127.0.0.1:3847/api/canva/callback",
        state: "state-1",
        codeChallenge: codeChallengeS256("verifier-value"),
      }),
    );
    expect(url.origin + url.pathname).toBe("https://mcp.canva.com/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("resource")).toBe("https://mcp.canva.com/mcp");
    expect(url.searchParams.get("scope")).toContain("design:content:write");
    expect(url.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update("verifier-value").digest("base64url"),
    );
    expect(url.toString()).not.toContain("secret");
  });

  it("refreshes with the refresh_token grant", () => {
    const body = refreshTokenBody("refresh-1");
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("refresh-1");
    expect(body.get("client_secret")).toBeNull();
  });

  it("builds browser redirects from the Host header, not 0.0.0.0", () => {
    const request = new Request("http://0.0.0.0:3847/api/canva/connect", {
      headers: { host: "127.0.0.1:3847" },
    });
    expect(browserOrigin(request)).toBe("http://127.0.0.1:3847");
  });

  it("reads a standard token response", () => {
    const tokens = readTokenResponse(
      { access_token: "access", refresh_token: "refresh", expires_in: 60, token_type: "Bearer", scope: "profile:read" },
      1_000,
    );
    expect(tokens.accessToken).toBe("access");
    expect(tokens.expiresAt).toBe(61_000);
  });
});

describe("tool arguments", () => {
  it("fills the only string field", () => {
    const built = buildGenerateArguments({ type: "object", properties: { query: { type: "string" } } }, "夜の告知");
    expect(built).toEqual({ ok: true, arguments: { query: "夜の告知" } });
  });

  it("uses the field whose description says it is the prompt", () => {
    const built = buildGenerateArguments(
      {
        type: "object",
        properties: {
          title: { type: "string", description: "Optional title" },
          user_query: { type: "string", description: "Natural language design prompt" },
        },
      },
      "ポスター",
    );
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.arguments).toEqual({ user_query: "ポスター" });
  });

  it("does not guess between two unnamed strings", () => {
    const built = buildGenerateArguments(
      {
        type: "object",
        properties: {
          alpha: { type: "string" },
          beta: { type: "string" },
        },
      },
      "ポスター",
    );
    expect(built.ok).toBe(false);
  });

  it("refuses to call generate-design without a schema", () => {
    expect(buildGenerateArguments(undefined, "ポスター").ok).toBe(false);
  });

  it("maps candidate_id and job_id only when the schema publishes them", () => {
    const built = buildCreateArguments(
      {
        type: "object",
        properties: {
          candidate_id: { type: "string" },
          job_id: { type: "string" },
        },
        required: ["candidate_id", "job_id"],
      },
      "dg-1",
      "job-1",
    );
    expect(built).toEqual({ ok: true, arguments: { candidate_id: "dg-1", job_id: "job-1" } });
  });

  it("nests the job id when the schema asks for job.id", () => {
    const built = buildCreateArguments(
      {
        type: "object",
        properties: {
          candidate_id: { type: "string" },
          job: { type: "object", properties: { id: { type: "string" } } },
        },
      },
      "dg-1",
      "job-1",
    );
    expect(built).toEqual({ ok: true, arguments: { candidate_id: "dg-1", job: { id: "job-1" } } });
  });

  it("does not invent create-design arguments", () => {
    expect(buildCreateArguments({ type: "object", properties: { candidate_id: { type: "string" } } }, "dg-1", "job-1").ok).toBe(false);
  });
});

describe("MCP responses", () => {
  it("reads the JSON-RPC message out of an event stream", () => {
    const body = 'event: message\ndata: {"jsonrpc":"2.0","id":7,"result":{"ok":true}}\n\n';
    expect(parseMcpMessage("text/event-stream", body, 7)).toMatchObject({ id: 7, result: { ok: true } });
  });

  it("reads documented design candidates and leaves unfinished jobs alone", () => {
    const done = readGeneratedDesigns({
      job: {
        id: "job-1",
        status: "success",
        result: {
          generated_designs: [{ candidate_id: "dg-1", url: "https://www.canva.com/d/1", thumbnails: [{ url: "https://design.canva.ai/1" }] }],
        },
      },
    });
    expect(done.ok).toBe(true);
    if (done.ok) {
      expect(done.generation.candidates[0]?.thumbnailUrls).toEqual(["https://design.canva.ai/1"]);
    }
    const pending = readGeneratedDesigns({ job: { id: "job-2", status: "in_progress" } });
    expect(pending.ok).toBe(false);
    if (!pending.ok) expect(pending.reason).toContain("in_progress");
  });

  it("reads a design summary", () => {
    const parsed = readDesignSummary({
      design_summary: {
        id: "DAF1",
        title: "告知",
        urls: { edit_url: "https://www.canva.com/d/edit", view_url: "https://www.canva.com/d/view" },
        page_count: 1,
      },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.design.editUrl).toBe("https://www.canva.com/d/edit");
  });
});

describe("session store", () => {
  let directory = "";
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("keeps tokens on the server record and out of the status payload", async () => {
    directory = await mkdtemp(path.join(tmpdir(), "kuse-canva-"));
    const store = createSessionStore(directory);
    const session = await store.mutate("session-1", (current) => {
      current.tokens = { accessToken: "super-secret-token", expiresAt: null, tokenType: "Bearer" };
    });
    const status = statusFrom({ configured: true, redirectUri: "http://127.0.0.1:3847/api/canva/callback", session });
    expect(status.connected).toBe(true);
    expect(JSON.stringify(status)).not.toContain("super-secret-token");
    expect(isAllowedCanvaHost("design.canva.ai")).toBe(true);
    expect(isAllowedCanvaHost("evil.example")).toBe(false);
  });
});

describe("thumbnails", () => {
  it("does not request a host outside Canva", async () => {
    await expect(
      fetchCanvaThumbnail("https://evil.example/secret", async () => {
        throw new Error("should not fetch");
      }),
    ).rejects.toThrow(/表示できません/);
  });
});

describe("later phases", () => {
  it("does not treat evaluation, the loop, or generated designs as ready", () => {
    expect(DesignEvaluator.available).toBe(false);
    expect(IterationManager.defaultLimit).toBe(3);
    expect(IterationManager.run().started).toBe(false);
    expect(StyleProfileManager.learnFromApprovedDesign().updated).toBe(false);
  });
});
