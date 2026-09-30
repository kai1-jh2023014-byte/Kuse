import { CANVA_AUTHORIZATION_ENDPOINT, CANVA_DOCS, CANVA_MCP_SERVER, CANVA_TOKEN_ENDPOINT, SELF_SERVICE_NOTE } from "./metadata";
import type { CanvaStatus, PublicVersion, SessionRecord, StoredVersion } from "./types";

export type { CanvaStatus, PublicVersion };

export function toPublicVersion(version: StoredVersion): PublicVersion {
  return {
    id: version.id,
    index: version.index,
    createdAt: version.createdAt,
    prompt: version.prompt,
    jobId: version.jobId,
    jobStatus: version.jobStatus,
    candidates: version.candidates,
    selectedCandidateId: version.selectedCandidateId,
    design: version.design,
    finishedAt: version.finishedAt,
    parentVersionId: version.parentVersionId,
    loopId: version.loopId,
    loopRound: version.loopRound,
    presented: version.presented,
    analysis: version.analysis,
    improvementPrompt: version.improvementPrompt,
    feedback: version.feedback,
    learningProposal: version.learningProposal,
  };
}

export function connectionAlive(session: SessionRecord | null, now = Date.now()): boolean {
  const tokens = session?.tokens;
  if (!tokens?.accessToken) return false;
  if (tokens.expiresAt === null) return true;
  if (tokens.expiresAt > now + 15_000) return true;
  return Boolean(tokens.refreshToken);
}

export function statusFrom(input: {
  configured: boolean;
  redirectUri: string;
  session: SessionRecord | null;
}): CanvaStatus {
  return {
    configured: input.configured,
    connected: input.configured && connectionAlive(input.session),
    redirectUri: input.redirectUri,
    scope: input.session?.tokens?.scope,
    tokenExpiresAt: input.session?.tokens?.expiresAt ?? null,
    versions: (input.session?.versions ?? []).map(toPublicVersion),
    portal: {
      mcpServer: CANVA_MCP_SERVER,
      authorizationEndpoint: CANVA_AUTHORIZATION_ENDPOINT,
      tokenEndpoint: CANVA_TOKEN_ENDPOINT,
      selfServiceNote: SELF_SERVICE_NOTE,
      docsUrl: CANVA_DOCS.access,
      waitlistUrl: CANVA_DOCS.waitlist,
    },
    unavailable: [],
  };
}
