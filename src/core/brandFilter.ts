import { config } from '../config.js';

function normalize(text: string): string {
  return text.toLowerCase();
}

export function getRequiredAnchors(): string[] {
  const anchors: string[] = [];

  for (const term of config.requiredTerms) {
    const normalized = term.trim();
    if (normalized) anchors.push(normalized);
  }

  if (config.playstoreAppId) {
    anchors.push(config.playstoreAppId);
    anchors.push(`play.google.com/store/apps/details?id=${config.playstoreAppId}`);
  }

  if (config.appstoreAppId) {
    anchors.push(`id${config.appstoreAppId}`);
    anchors.push(`apps.apple.com/app/id${config.appstoreAppId}`);
  }

  return Array.from(new Set(anchors));
}

/** @deprecated Use getRequiredAnchors() */
export const getBrandAnchors = getRequiredAnchors;

export function getStrongAnchors(): string[] {
  return getRequiredAnchors().filter(term => {
    const normalized = term.toLowerCase();
    return normalized.includes('.') ||
      normalized.includes('/') ||
      normalized.startsWith('id') ||
      normalized.includes('play.google.com') ||
      normalized.includes('apps.apple.com');
  });
}

/** @deprecated Use getStrongAnchors() */
export const getStrongBrandAnchors = getStrongAnchors;

export function matchesTarget(text: string | null | undefined): boolean {
  if (!text) return false;
  const haystack = normalize(text);

  if (config.filterStrict) {
    const strong = getStrongAnchors().map(term => normalize(term)).filter(Boolean);
    if (strong.length > 0) {
      return strong.some(term => haystack.includes(term));
    }
    const requiredFallback = getRequiredAnchors().map(term => normalize(term)).filter(Boolean);
    if (requiredFallback.length > 0) {
      return requiredFallback.some(term => haystack.includes(term));
    }
  } else {
    const required = getRequiredAnchors().map(term => normalize(term)).filter(Boolean);
    if (required.length > 0) {
      return required.some(term => haystack.includes(term));
    }
  }

  const search = config.searchTerms.map(term => normalize(term)).filter(Boolean);
  if (search.length > 0) {
    return search.some(term => haystack.includes(term));
  }

  return false;
}

/** @deprecated Use matchesTarget() */
export const matchesBrand = matchesTarget;

export function matchesTargetBalanced(text: string | null | undefined, contextKeywords: string[]): boolean {
  if (!text) return false;
  const haystack = normalize(text);

  // Always allow strong/required anchors
  if (matchesTarget(haystack)) return true;

  // Balanced mode: require at least one search term plus contextual keywords
  const primaryTerms = config.searchTerms.map(t => normalize(t)).filter(Boolean);
  if (primaryTerms.length === 0) return false;

  const hasPrimary = primaryTerms.some(term => haystack.includes(term));
  if (!hasPrimary) return false;

  return contextKeywords.some(keyword => haystack.includes(normalize(keyword)));
}

/** @deprecated Use matchesTargetBalanced() */
export const matchesBrandBalanced = matchesTargetBalanced;
