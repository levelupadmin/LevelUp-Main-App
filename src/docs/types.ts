/**
 * Shared types for the LevelUp documentation portal.
 *
 * All structured doc content (features, flows, schema rows) lives in
 * sibling .ts files so it stays type-checked + searchable + diffable
 * in git, and can be exported to a single markdown blob for LLM
 * consumption without parsing HTML/MDX at runtime.
 */

export type FeatureStatus = "shipped" | "partial" | "planned" | "deprecated";

export interface Feature {
  /** Slug used in search + URL anchor */
  slug: string;
  /** Sentence-cased display title */
  title: string;
  /** 1-2 sentences, non-developer audience */
  summary: string;
  /** Coarse grouping for the Features tab grid */
  area:
    | "Auth"
    | "Storefront"
    | "Checkout"
    | "Learning"
    | "Cohort"
    | "Community"
    | "Admin"
    | "Marketing"
    | "Payment"
    | "Content"
    | "Analytics"
    | "Platform"
    | "API";
  status: FeatureStatus;
  /** Where in the codebase this lives (so a dev can jump straight to it) */
  codeRefs?: string[];
  /** Where in the app to see it (so a non-dev can click and see it work) */
  appRefs?: string[];
  /** Optional deep dive — markdown-style prose, rendered with prose styles */
  details?: string;
}

export interface FlowStep {
  title: string;
  description: string;
  /** Optional screenshot keys — will be looked up in /docs/screenshots/ */
  screenshot?: {
    desktop?: string;
    mobile?: string;
    /** Placeholder text to show until real screenshots are captured */
    placeholder?: string;
  };
}

export interface Flow {
  slug: string;
  title: string;
  audience: "student" | "admin" | "instructor" | "marketing";
  summary: string;
  steps: FlowStep[];
}

export interface SchemaTable {
  name: string;
  purpose: string;
  /** Whether typical operators see this in /admin (vs internal plumbing) */
  surfacedInAdmin: boolean;
  rowCountRange?: string; // e.g. "1K-10K"
  keyColumns: Array<{ name: string; type: string; description: string }>;
  relationships?: string[];
}

export interface ChangelogRow {
  id: string;
  title: string;
  summary: string;
  area: string;
  status: FeatureStatus;
  shipped_at: string | null;
  version: string | null;
  body_md: string | null;
  author: string;
  user_facing: boolean;
  created_at: string;
}
