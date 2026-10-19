// Follower tiers for the Influencer tab. A creator belongs to exactly one tier, derived from
// follower_count (never chosen by hand), so it moves automatically when the count is updated.
// Creators under 1K or without a count are in no tier.
export const TIERS = [
  { id: 'nano', name: 'NANO', min: 1e3, max: 1e4, range: '1K–9,999' },
  { id: 'micro', name: 'MICRO', min: 1e4, max: 5e4, range: '10K–49,999' },
  { id: 'mid', name: 'MID-TIER', min: 5e4, max: 1e5, range: '50K–99,999' },
  { id: 'macro', name: 'MACRO', min: 1e5, max: 5e5, range: '100K–499,999' },
  { id: 'mega', name: 'MEGA', min: 5e5, max: Infinity, range: '500K+' },
];

export const tierOf = (followers) => (followers == null ? null : TIERS.find((t) => followers >= t.min && followers < t.max) || null);
