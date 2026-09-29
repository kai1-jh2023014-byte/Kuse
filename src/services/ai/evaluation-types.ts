/** Likeness to the saved design profile. This is not a quality score. */

export type MatchLevel = "high" | "medium" | "low";
export type ImprovementPriority = "high" | "medium" | "low";

export interface AxisAnalysis {
  match: MatchLevel;
  reason: string;
}

export interface DesignImprovement {
  category: string;
  priority: ImprovementPriority;
  problem: string;
  suggestion: string;
  desired: string;
}

export interface DesignEvaluation {
  style_similarity: number;
  requirement_match: number;
  analysis: {
    color: AxisAnalysis;
    layout: AxisAnalysis;
    typography: AxisAnalysis;
    visual: AxisAnalysis;
  };
  matches: string[];
  gaps: string[];
  improvements: DesignImprovement[];
  requirement_note: string;
  mode: "measured" | "measured+vision";
}

/** Semantic reading of composition. Color numbers stay with the pixel measurement. */
export interface DesignInterpretation {
  layout?: string;
  typography?: string;
  density?: string;
  gaze?: string;
  features?: string[];
  requirementNote?: string;
}

export interface VersionFeedback {
  feelsLikeMe: boolean;
  difference: string;
  updatedAt: string;
}

export interface LearningTrait {
  id: string;
  label: string;
  detail: string;
  confidence: number;
}

export interface LearningProposal {
  traits: LearningTrait[];
  message: string;
  approvedAt?: string;
}
