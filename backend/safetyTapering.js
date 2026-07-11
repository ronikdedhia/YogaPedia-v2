// Injury-aware auto-adjustment (ROADMAP.md). Previously a safety flag (pregnant, recent
// injury/surgery, high blood pressure, glaucoma) only ever influenced ONE regeneration at
// a time — chains/schedule.js's prompt reacts to whichever flags are checked *right now*,
// with nothing carried forward. That means tapering intensity down the longer a condition
// stays active was entirely dependent on the LLM happening to remember/infer that on every
// single regeneration — nothing enforced it. This tracks flag duration in the schedule doc
// itself and derives a deterministic intensity cap from it, enforced in code (clampPlanIntensity),
// not left to LLM discretion alone.

// Called each time a schedule is (re)generated. `prevHistory` is the schedule doc's stored
// `safetyFlagHistory` from before this regeneration (undefined on first-ever generation).
// A flag not currently checked is dropped entirely — e.g. marking "recent injury" as
// resolved resets its taper rather than keeping a stale streak around forever.
function computeFlagHistory(prevHistory, flags) {
  const next = {};
  for (const [key, isActive] of Object.entries(flags || {})) {
    if (!isActive) continue;
    const prev = prevHistory?.[key];
    next[key] = {
      firstSetAt: prev?.firstSetAt || new Date(),
      consecutiveWeeks: (prev?.consecutiveWeeks || 0) + 1,
    };
  }
  return next;
}

// Deterministic tiers, not an LLM judgment call. Intensity only ever tapers DOWN the longer
// a safety flag stays active across regenerations, never back up — a flag still being
// checked after several weeks is not evidence it's safe to loosen up (e.g. an injury flag
// still active after a month if anything argues for more caution, not less), and flags with
// no natural resolution (pregnancy, high blood pressure, glaucoma) shouldn't auto-relax
// just because time passed. The user unchecking the flag (because it's actually resolved)
// is the only thing that should ever lift the cap — see computeFlagHistory. `null` means no
// active flags, so no tapering is needed at all this time.
const TIERS = [
  { maxWeeks: 2, label: 'cautious', maxPoseMinutes: 5, maxPranayamaMinutes: 10 },
  { maxWeeks: 4, label: 'gentle', maxPoseMinutes: 4, maxPranayamaMinutes: 7 },
  { maxWeeks: Infinity, label: 'very gentle', maxPoseMinutes: 3, maxPranayamaMinutes: 5 },
];

function computeIntensityTier(safetyFlagHistory) {
  const weeksValues = Object.values(safetyFlagHistory || {}).map((h) => h.consecutiveWeeks);
  if (weeksValues.length === 0) return null;
  const maxWeeks = Math.max(...weeksValues);
  const tier = TIERS.find((t) => maxWeeks <= t.maxWeeks);
  return { ...tier, weeksActive: maxWeeks };
}

// Defense in depth: even if the prompt's instruction gets ignored, the returned plan's
// pose/pranayama durations are hard-clamped to the tier's cap before being saved/returned.
function clampPlanIntensity(plan, tier) {
  if (!tier || !plan?.days) return plan;
  for (const day of Object.values(plan.days)) {
    for (const pose of day.poses || []) {
      if (typeof pose.duration_minutes === 'number' && pose.duration_minutes > tier.maxPoseMinutes) {
        pose.duration_minutes = tier.maxPoseMinutes;
      }
    }
    if (day.pranayama && typeof day.pranayama.duration_minutes === 'number' && day.pranayama.duration_minutes > tier.maxPranayamaMinutes) {
      day.pranayama.duration_minutes = tier.maxPranayamaMinutes;
    }
  }
  return plan;
}

module.exports = { computeFlagHistory, computeIntensityTier, clampPlanIntensity };
