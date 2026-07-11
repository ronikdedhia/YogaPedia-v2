const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { textModel } = require('../llm');
const CURATED_ASANAS = require('../curatedAsanas');
const CURATED_PRANAYAMA = require('../curatedPranayama');
const CURATED_MEALS = require('../curatedMeals');

// Generic day1..dayN labels rather than specific weekdays (mon/tue/...) — onboarding
// only collects a COUNT of days per week, not which calendar days, so there's nothing
// to map "mon"/"tue" onto. Whoever consumes the schedule (frontend "today" view) is
// responsible for deciding which stored day applies to today, e.g. by cycling through
// day1..dayN starting from when the schedule was created.
const PROMPT = ChatPromptTemplate.fromTemplate(`You are an experienced, safety-conscious yoga instructor drafting a personalized WEEKLY practice plan.

Student's stated health problems / goals: "{problems}"
Student's diet: "{diet}"
Goal tags: {goalTags}
Experience level: {experienceLevel}
Safety flags checked: {flagLines}
Days per week available to practice: {daysPerWeek}
Minutes available per session (poses + pranayama only — walking is separate): {minutesPerSession}

Practice history from recent sessions: {struggleLines}

Safety tapering requirement: {taperingLine}

Choose asanas ONLY from this list — do not invent or use any asana not listed here:
{asanaLines}

Choose a pranayama (breathing) technique for each day ONLY from this list — do not invent others:
{pranayamaLines}

Choose 4 meals (one breakfast, one lunch, one dinner, one snack) ONLY from this list — do not invent meals not listed here:
{mealLines}

Respond with ONLY a JSON object, no other text, matching exactly this shape:
{{
  "planTitle": "<short descriptive title for this plan>",
  "waterTargetLiters": <number, a general daily hydration target — not personalized by body metrics, just informed by experience level/activity>,
  "days": {{
    "day1": {{
      "poses": [ {{ "order": 1, "asana": "<name exactly as listed above>", "duration_minutes": <integer>, "why": "<one sentence tied to the student's stated problems>" }} ],
      "pranayama": {{ "technique": "<name exactly as listed above>", "duration_minutes": <integer>, "why": "<one sentence>" }},
      "walk": {{ "duration_minutes": <integer>, "why": "<one sentence>" }}
    }}
  }},
  "meals": [ {{ "type": "breakfast|lunch|dinner|snack", "meal": "<name exactly as listed above>", "why": "<one sentence tying it to the student's stated diet/problems/goals>" }} ],
  "cautions": ["<any relevant caution, especially tied to checked safety flags>"],
  "disclaimer": "This is a general wellness suggestion, not medical advice — consult a healthcare professional for serious or persistent conditions."
}}

Produce exactly {daysPerWeek} entries in "days", keyed "day1" through "day{daysPerWeek}". Each day's poses should sum to roughly {minutesPerSession} minutes total (poses + pranayama combined). Vary the poses across days for variety, but repeat a pose more often across the week if it's especially relevant to the student's stated problem. If any safety flag is set (pregnant, recent injury or surgery, high blood pressure, glaucoma), do not include inversions, deep backbends, or intense core-compression poses relevant to that flag, and say why in "cautions". Calibrate hold times and pose difficulty to the stated experience level. If practice history flags a pose as a real struggle, don't just drop it — keep it in rotation (repetition is how it improves) but note in its "why" a brief, encouraging cue addressing the specific body part that keeps getting flagged, and consider a slightly shorter hold time for it than an equivalent pose with no struggle history. "meals" is one representative day's worth for the whole plan (not per day) — pick meals whose dietTags fit the student's stated diet and whose goalTags fit their goal tags/problems.`);

const chain = PROMPT.pipe(textModel.withConfig({ response_format: { type: 'json_object' } }));

async function draftSchedule({
  problems,
  diet,
  goalTags,
  experienceLevel,
  flags,
  daysPerWeek,
  minutesPerSession,
  struggleSummary,
  intensityTier,
}) {
  const flagLines = Object.entries(flags || {})
    .filter(([, v]) => v)
    .map(([k]) => k);

  // Plain-code aggregation (models/sessionLogs.js's getStruggleSummaryForUser), not another
  // LLM call — just formatted into the prompt so the schedule-drafting call can react to it.
  const struggleLines =
    struggleSummary && struggleSummary.length > 0
      ? struggleSummary
          .map((s) => `- ${s.asana}: marked incorrect in ${s.incorrect} of ${s.attempts} recent attempts${s.topBodyPart ? `, most often flagged: ${s.topBodyPart}` : ''}`)
          .join('\n')
      : 'No practice history yet, or nothing stands out as a recurring struggle.';

  // Deterministic, computed in code (backend/safetyTapering.js) from how long a safety flag
  // has stayed active across regenerations — not left to the LLM to infer or remember on
  // its own, and enforced again afterward regardless (see clampPlanIntensity in index.js).
  const taperingLine = intensityTier
    ? `This student has had an active safety flag for ${intensityTier.weeksActive} consecutive plan regeneration(s) — cap intensity at "${intensityTier.label}": no pose held longer than ${intensityTier.maxPoseMinutes} minutes, no pranayama longer than ${intensityTier.maxPranayamaMinutes} minutes. Favor restorative/gentle variants.`
    : 'None — no currently active safety flag has an ongoing tapering requirement.';

  const result = await chain.invoke({
    problems: problems || 'none specified',
    diet: diet || 'none specified',
    goalTags: goalTags && goalTags.length ? goalTags.join(', ') : 'none specified',
    experienceLevel: experienceLevel || 'beginner',
    flagLines: flagLines.length ? flagLines.join(', ') : 'none',
    daysPerWeek,
    minutesPerSession,
    struggleLines,
    taperingLine,
    asanaLines: CURATED_ASANAS.map((a) => `- ${a.asana}: ${a.benefits}`).join('\n'),
    pranayamaLines: CURATED_PRANAYAMA.map((p) => `- ${p.technique}: ${p.benefits}`).join('\n'),
    mealLines: CURATED_MEALS.map((m) => `- [${m.type}] ${m.meal} (suits: ${m.dietTags.join('/')}; ${m.goalTags.join('/')}): ${m.why}`).join('\n'),
  });

  return JSON.parse(result.content);
}

module.exports = { draftSchedule };
