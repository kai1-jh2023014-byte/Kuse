/** Open design-profile model. Fixed sections exist, and new traits can be stored without a schema change. */

export interface PaletteColor {
  hex: string;
  ratio: number;
  saturation: number;
  lightness: number;
}

export type Orientation = "portrait" | "landscape" | "square";

export interface RawImageSignals {
  id: string;
  filename: string;
  width: number;
  height: number;
  palette: PaletteColor[];
  background: PaletteColor;
  mainColors: string[];
  accentColors: string[];
  brightness: number;
  saturation: number;
  contrast: number;
  whitespace: number;
  density: number;
  symmetry: number;
  verticalBalance: number;
  horizontalBalance: number;
  grid: number[][];
  photoScore: number;
  illustrationScore: number;
  gradientScore: number;
  shadowScore: number;
  borderScore: number;
  edgeDensity: number;
  textScore: number;
  titleDominance: number;
  uniqueColorCount: number;
  warmCool: number;
  backgroundRatio: number;
  inkCenter: { x: number; y: number };
  orientation: Orientation;
}

export interface ImageAnalysis {
  id: string;
  filename: string;
  width: number;
  height: number;
  analyzedAt: string;
  signals: RawImageSignals;
}

export interface PersonalTendency {
  id: string;
  statement: string;
  evidence: string;
  confidence: number;
  category: string;
  supportCount: number;
  sampleCount: number;
}

export interface DiscoveredTrait {
  id: string;
  label: string;
  detail: string;
  confidence: number;
  evidence: string;
  source: "comparison" | "vision";
}

export interface ProfileMetrics {
  brightness: number;
  saturation: number;
  contrast: number;
  whitespace: number;
  density: number;
  symmetry: number;
  photo: number;
  illustration: number;
  gradient: number;
  shadow: number;
  border: number;
  text: number;
  titleDominance: number;
  verticalBalance: number;
  horizontalBalance: number;
  warmCool: number;
  backgroundRatio: number;
  paletteSize: number;
  accentCount: number;
}

export interface StyleRelationships {
  color: string;
  layout: string;
  typography: string;
  visual: string;
}

export interface DesignProfile {
  version: 1;
  updatedAt: string;
  sampleCount: number;
  color: {
    main: string[];
    accent: string[];
    background: string[];
    contrast: string;
    saturation: string;
    brightness: string;
    notes: string[];
  };
  layout: {
    alignment: string;
    spacing: string;
    density: string;
    composition: string;
    vertical: string;
    horizontal: string;
    grid: string;
  };
  typography: {
    style: string;
    title_size: string;
    body_size: string;
    weight: string;
    spacing: string;
    line_height: string;
    title_placement: string;
  };
  visual: {
    photo: string;
    illustration: string;
    icon: string;
    shape: string;
    gradient: string;
    shadow: string;
    border: string;
    decoration: string;
  };
  mood: string[];
  personal_tendencies: PersonalTendency[];
  avoid: string[];
  discovered: DiscoveredTrait[];
  /** Free-form bag for traits that do not fit the sections above. */
  extensions: Record<string, unknown>;
  narrative: string;
  changelog: string[];
  metrics: ProfileMetrics;
  reading: {
    signature: string;
    relationships: StyleRelationships;
    conflicts: string[];
  };
  analysisMode: "heuristic" | "vision";
}

export interface DesignBrief {
  purpose: string;
  audience: string;
  copyText: string;
  size: string;
  mood: string;
  imagery: string;
  notes: string;
}

export interface PromptModifiers {
  simplicity: number;
  impact: number;
  textEmphasis: number;
  whitespace: number;
  custom: string;
}

export interface AnalyzeImageInput {
  signals: RawImageSignals;
  thumbnailDataUrl?: string;
  analyzedAt?: string;
}

export interface PromptResult {
  prompt: string;
  mode: "heuristic" | "vision";
  styleStrength: number;
}
