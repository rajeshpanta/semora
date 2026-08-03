import type { FeatureSlug } from './semora-facts';

/**
 * Long-form editorial content for each /features/{slug} page.
 *
 * The short `description` on FEATURES in semora-facts.ts is the one-paragraph
 * summary reused in the nav dropdown and cards; this is the full page body.
 * Every claim here was written against the shipping source (the files listed
 * in `sourcesRead`) and then adversarially fact-checked — treat it the same
 * way semora-facts.ts is treated: do not edit a number without re-verifying
 * it against the app.
 */
export interface FeatureSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface FeatureLongForm {
  metaTitle: string;
  metaDescription: string;
  h1: string;
  lede: string;
  intro: string[];
  sections: FeatureSection[];
  faq: { question: string; answer: string }[];
}

export const FEATURE_CONTENT: Partial<Record<FeatureSlug, FeatureLongForm>> = {};

export function getFeatureContent(slug: string): FeatureLongForm | undefined {
  return FEATURE_CONTENT[slug as FeatureSlug];
}
