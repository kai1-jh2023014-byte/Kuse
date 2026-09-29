import type { JsonSchema } from "./schema";

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number | null;
  scope?: string;
  tokenType: string;
}

export interface StoredThumbnail {
  url: string;
  fetchedAt: string;
  /** Signed Canva thumbnail URLs expire. This is not a permanent asset. */
  ephemeral: true;
}

export interface StoredCandidate {
  candidateId: string;
  url?: string;
  thumbnails: StoredThumbnail[];
}

export interface StoredDesign {
  id: string;
  title?: string;
  editUrl?: string;
  viewUrl?: string;
  createdAt?: number;
  updatedAt?: number;
  pageCount?: number;
}

export interface StoredVersion {
  id: string;
  index: number;
  createdAt: string;
  prompt: string;
  jobId: string;
  jobStatus: string;
  candidates: StoredCandidate[];
  selectedCandidateId?: string;
  design?: StoredDesign;
  finishedAt?: string;
  analysis: null;
  improvements: null;
}

export interface StoredTool {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
}

export interface PendingOAuth {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

export interface SessionRecord {
  id: string;
  createdAt: string;
  tokens?: StoredTokens;
  pending?: PendingOAuth;
  versions: StoredVersion[];
  tools?: { fetchedAt: string; list: StoredTool[] };
}

export interface PublicVersion {
  id: string;
  index: number;
  createdAt: string;
  prompt: string;
  jobId: string;
  jobStatus: string;
  candidates: StoredCandidate[];
  selectedCandidateId?: string;
  design?: StoredDesign;
  finishedAt?: string;
  analysis: null;
  improvements: null;
}

export interface CanvaStatus {
  configured: boolean;
  connected: boolean;
  redirectUri: string;
  scope?: string;
  tokenExpiresAt: number | null;
  versions: PublicVersion[];
  portal: {
    mcpServer: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    selfServiceNote: string;
    docsUrl: string;
    waitlistUrl: string;
  };
  unavailable: { id: string; todo: string }[];
}
