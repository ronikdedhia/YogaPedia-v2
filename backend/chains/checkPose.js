const { HumanMessage } = require('@langchain/core/messages');
const { visionModel } = require('../llm');

// Not using ChatGroq's withStructuredOutput() here — verified empirically (see git
// history / ARCHITECTURE.md §9.10) that it routes through Groq's server-side tool-call
// schema validation, which hard-fails (400) if the model emits e.g. "90" instead of 90
// for an integer field. response_format: json_object + manual JSON.parse is the same
// proven-reliable pattern the app used before the LangChain.js migration, just now
// going through LangChain's ChatGroq/HumanMessage instead of groq-sdk directly.
// Language names the model is asked to translate into, keyed by the same codes the
// frontend's language picker uses (preferences.js's getLanguage). "en" never reaches this
// map — buildPrompt skips the localized fields entirely for the default/common case, to
// keep the prompt (and per-request token cost — see ARCHITECTURE.md §17.1) unchanged for
// anyone not using this feature.
const LANGUAGE_NAMES = { hi: 'Hindi' };

function buildPrompt(poseNames, language) {
  const localizedName = LANGUAGE_NAMES[language];
  const localizedFields = localizedName
    ? `,
  "body_part_localized": "<\"body_part\" above, translated into ${localizedName} — or null if is_correct is true>",
  "correction_localized": "<\"correction\" above, translated into ${localizedName} — or null if is_correct is true>"`
    : '';

  return `You are a yoga instructor reviewing a single snapshot of a student holding a pose, captured from a front-facing mirror-style webcam view (i.e. describe left/right exactly as they appear in the image, the same way a mirror would show them to the student).

Known poses this app supports: ${poseNames.join(', ')}.

Look at the image and respond with ONLY a JSON object, no other text, matching exactly this shape:
{
  "pose": "<one of the known poses above, or \\"Unrecognized\\" if it doesn't clearly match any of them>",
  "confidence": <integer 0-100>,
  "is_correct": <true if the form looks correct for that pose, false otherwise>,
  "body_part": "<the single body part most responsible for the issue, in English, e.g. \\"left knee\\", \\"lower back\\", \\"shoulders\\" — or null if is_correct is true>",
  "correction": "<one short, actionable sentence in English telling the student what to fix — or null if is_correct is true>"${localizedFields}
}

"pose", "body_part", and "correction" must always be in English regardless of any other instruction — they're used for internal matching and analytics, not shown directly.${localizedName ? ` Only "body_part_localized"/"correction_localized" should be in ${localizedName}.` : ''} If no person or no clear full-body pose is visible, set "pose" to "Unrecognized", "confidence" to 0, "is_correct" to false, and every body_part/correction field (including localized ones) to null except "correction" which should be "Make sure your full body is visible in frame."`;
}

// The model doesn't always return the candidate name verbatim even when told to
// (observed: "Tree Pose" instead of the exact candidate "Tree Pose (Vrikshasana)") —
// normalize it back to the exact known string so downstream code (demo image lookup,
// session-log aggregation) doesn't silently split one pose into two different labels.
function normalizePoseName(rawPose, poseNames) {
  if (!rawPose || rawPose === 'Unrecognized') return 'Unrecognized';
  const exact = poseNames.find((name) => name === rawPose);
  if (exact) return exact;

  const lowerRaw = rawPose.toLowerCase();
  const caseInsensitive = poseNames.find((name) => name.toLowerCase() === lowerRaw);
  if (caseInsensitive) return caseInsensitive;

  const substringMatch = poseNames.find(
    (name) => name.toLowerCase().includes(lowerRaw) || lowerRaw.includes(name.toLowerCase().replace(/\s*\(.*\)\s*/g, '').trim()),
  );
  if (substringMatch) return substringMatch;

  return 'Unrecognized'; // couldn't confidently map it back — safer than keeping a drifted label
}

async function checkPose(imageDataUrl, poseNames, language = 'en') {
  const message = new HumanMessage({
    content: [
      { type: 'text', text: buildPrompt(poseNames, language) },
      { type: 'image_url', image_url: { url: imageDataUrl } },
    ],
  });

  const result = await visionModel.invoke([message], { response_format: { type: 'json_object' } });
  const parsed = JSON.parse(result.content);
  parsed.pose = normalizePoseName(parsed.pose, poseNames);
  return parsed;
}

module.exports = { checkPose, SUPPORTED_LANGUAGES: ['en', ...Object.keys(LANGUAGE_NAMES)] };
