import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { IterationManager } from "@/services/agents/iteration-manager";
import { CanvaError, toCanvaError } from "./errors";
import { browserOrigin } from "./config";
import { buildAuthorizationUrl, readTokenResponse, refreshTokenBody } from "./oauth";
import { codeChallengeS256 } from "./pkce";
import { isAllowedCanvaHost, parseMcpMessage, readAsyncDesignJob, readDesignSummary, readGeneratedDesigns } from "./parse";
import { statusFrom } from "./public";
import { buildCreateArguments, buildCreateDesignArguments, buildGenerateArguments, buildJobPollArguments } from "./schema";
import { createSessionStore } from "./store";
import { needsMcpRegistration, registerMcpOAuthClient, resolveMcpOAuthClient } from "./mcp-oauth-client";
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

  it("registers an MCP client when the portal id would hit authorize 500", async () => {
    expect(needsMcpRegistration("OC-AaDyC85qcmWW")).toBe(true);
    expect(needsMcpRegistration("gq6_FeUBW7XLVZJb")).toBe(false);
    const client = await registerMcpOAuthClient("http://127.0.0.1:3847/api/canva/callback", async (input, init) => {
      expect(String(input)).toBe("https://mcp.canva.com/register");
      const body = JSON.parse(String(init?.body));
      expect(body.redirect_uris).toContain("http://127.0.0.1:3847/api/canva/callback");
      expect(body.redirect_uris).toContain("http://localhost:3847/api/canva/callback");
      return Response.json(
        { client_id: "mcp-client", client_secret: "mcp-secret" },
        { status: 201 },
      );
    });
    expect(client.clientId).toBe("mcp-client");
    expect(client.clientSecret).toBe("mcp-secret");
  });

  it("registers an MCP client even when .env has no portal id", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "kuse-mcp-"));
    const previous = {
      dir: process.env.KUSE_DATA_DIR,
      id: process.env.CANVA_CLIENT_ID,
      secret: process.env.CANVA_CLIENT_SECRET,
    };
    process.env.KUSE_DATA_DIR = directory;
    delete process.env.CANVA_CLIENT_ID;
    delete process.env.CANVA_CLIENT_SECRET;
    try {
      const client = await resolveMcpOAuthClient("http://127.0.0.1:3847/api/canva/callback", async () =>
        Response.json({ client_id: "from-register", client_secret: "from-register-secret" }, { status: 201 }),
      );
      expect(client.clientId).toBe("from-register");
    } finally {
      if (previous.dir === undefined) delete process.env.KUSE_DATA_DIR;
      else process.env.KUSE_DATA_DIR = previous.dir;
      if (previous.id === undefined) delete process.env.CANVA_CLIENT_ID;
      else process.env.CANVA_CLIENT_ID = previous.id;
      if (previous.secret === undefined) delete process.env.CANVA_CLIENT_SECRET;
      else process.env.CANVA_CLIENT_SECRET = previous.secret;
      await rm(directory, { recursive: true, force: true });
    }
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
    expect(built.ok).toBe(true);
    if (built.ok) expect(String(built.arguments.query)).toContain("夜の告知");
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
    if (built.ok) expect(String(built.arguments.user_query)).toContain("ポスター");
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

  it("sends a published design_type instead of putting the prompt into the enum", () => {
    const schema = {
      type: "object",
      required: ["query", "design_type"],
      properties: {
        query: { type: "string" },
        design_type: {
          type: "string",
          enum: ["business_card", "flyer", "instagram_post", "poster", "presentation"],
        },
        user_intent: { type: "string" },
      },
    };
    const slides = buildGenerateArguments(schema, "【このスライドの役割】表紙。夜の告知。");
    expect(slides.ok).toBe(true);
    if (slides.ok) {
      expect(slides.arguments.query).toContain("夜の告知");
      expect(slides.arguments.design_type).toBe("presentation");
      expect(slides.arguments.user_intent).toBeTruthy();
    }
    const poster = buildGenerateArguments(schema, "A3ポスター。余白を広く。");
    expect(poster.ok).toBe(true);
    if (poster.ok) expect(poster.arguments.design_type).toBe("poster");

    const youtubeSchema = {
      type: "object",
      required: ["query", "design_type"],
      properties: {
        query: { type: "string" },
        design_type: {
          type: "string",
          enum: ["poster", "presentation", "youtube_thumbnail"],
        },
      },
    };
    const youtube = buildGenerateArguments(
      youtubeSchema,
      [
        "【目的】",
        "YouTubeサムネイルを作りたい。",
        "サイズは1280×720（YouTubeサムネイル）。",
        "次の文字を、優先順位が分かる大きさで配置してください。文言は改変しないでください。",
        "学歴厨向け",
        "学歴で世界を作るゲーム",
        "",
        "【避けること】",
        "・すべてのスライドを同じ大きさ、同じコントラストに揃えること",
      ].join("\n"),
    );
    expect(youtube.ok).toBe(true);
    if (youtube.ok) {
      expect(youtube.arguments.design_type).toBe("youtube_thumbnail");
      expect(String(youtube.arguments.query)).toContain("学歴厨向け");
      expect(String(youtube.arguments.query)).toContain("学歴で世界を作るゲーム");
      expect(String(youtube.arguments.query)).toMatch(/not generate a slide deck/i);
    }

    const onePage = buildGenerateArguments(
      schema,
      ["【このスライドの役割】", "表紙。", "【この1枚だけ】", "全5枚のうち1枚目だけを1ページで作ってください。"].join("\n"),
    );
    expect(onePage.ok).toBe(true);
    if (onePage.ok) {
      expect(onePage.arguments.design_type).toBe("presentation");
      expect(String(onePage.arguments.query)).toMatch(/exactly one 16:9 presentation slide/i);
    }

    const noEnum = buildGenerateArguments(
      {
        type: "object",
        required: ["query", "design_type"],
        properties: { query: { type: "string" }, design_type: { type: "string" } },
      },
      "【このスライドの役割】着地。",
    );
    expect(noEnum.ok).toBe(true);
    if (noEnum.ok) expect(noEnum.arguments.design_type).toBe("presentation");
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

  it("fills create-design brief and format without summarizing", () => {
    const schema = {
      type: "object",
      required: ["brief"],
      properties: {
        brief: { type: "string" },
        query: { type: "string" },
        format: {
          type: "string",
          enum: ["logo", "poster", "presentation", "youtube_thumbnail"],
        },
        user_intent: { type: "string" },
      },
    };
    const built = buildCreateDesignArguments(
      schema,
      [
        "【目的】",
        "YouTubeサムネイルを作りたい。",
        "サイズは1280×720（YouTubeサムネイル）。",
        "次の文字を、優先順位が分かる大きさで配置してください。文言は改変しないでください。",
        "学歴厨向け",
        "学歴で世界を作るゲーム",
      ].join("\n"),
    );
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.arguments.brief).toContain("学歴厨向け");
      expect(built.arguments.brief).toContain("【目的】");
      expect(built.arguments.format).toBe("youtube_thumbnail");
    }
    const poll = buildJobPollArguments(
      { type: "object", required: ["job_id"], properties: { job_id: { type: "string" }, continuation_token: { type: "string" } } },
      "job-9",
      "cont-1",
    );
    expect(poll).toEqual({ ok: true, arguments: { job_id: "job-9", continuation_token: "cont-1" } });
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
    if (!pending.ok) expect(pending.code).toBe("generation_incomplete");
  });

  it("reads a completed create-design job as an editable design", () => {
    const done = readAsyncDesignJob({
      job: {
        id: "job-3",
        status: "success",
        result: {
          design: {
            id: "DAF-create",
            title: "告知",
            urls: { edit_url: "https://www.canva.com/design/DAF-create/edit" },
            thumbnails: [{ url: "https://export-download.canva.com/t/1" }],
          },
        },
      },
    });
    expect(done.ok).toBe(true);
    if (done.ok && !done.pending) {
      expect(done.design?.id).toBe("DAF-create");
      expect(done.generation.candidates[0]?.candidateId).toBe("DAF-create");
      expect(done.generation.candidates[0]?.thumbnailUrls).toContain("https://export-download.canva.com/t/1");
    }
    const waiting = readAsyncDesignJob({
      job: { id: "job-4", status: "in_progress" },
      polling_policy: { wait_seconds: 3 },
      continuation_token: "tok-1",
    });
    expect(waiting.ok).toBe(true);
    if (waiting.ok && waiting.pending) {
      expect(waiting.waitSeconds).toBe(3);
      expect(waiting.continuationToken).toBe("tok-1");
    }
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
    const disconnectedLook = statusFrom({
      configured: false,
      redirectUri: "http://127.0.0.1:3847/api/canva/callback",
      session,
    });
    expect(disconnectedLook.connected).toBe(true);
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

describe("error mapping", () => {
  it("does not leak a raw Internal Server Error as a 500 wrapper", () => {
    const timeout = new Error("The operation was aborted");
    timeout.name = "TimeoutError";
    expect(toCanvaError(timeout).status).toBe(504);
    expect(toCanvaError(timeout).message).toContain("時間切れ");
    const mapped = toCanvaError(new Error("boom"));
    expect(mapped).toBeInstanceOf(CanvaError);
    expect(mapped.message).not.toMatch(/Internal Server Error/i);
  });
});

describe("later phases", () => {
  it("does not start the multi-step edit loop", () => {
    expect(IterationManager.defaultLimit).toBe(3);
    expect(IterationManager.run().started).toBe(false);
  });
});
