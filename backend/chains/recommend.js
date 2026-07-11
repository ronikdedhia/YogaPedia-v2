const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { textModel } = require('../llm');

const PROMPT = ChatPromptTemplate.fromTemplate(`You are an experienced, safety-conscious yoga instructor drafting a short personalized daily practice plan.

Student's stated health problems / goals: "{problems}"
Student's diet: "{diet}"
Safety flags the student checked: {flagLines}

Choose ONLY from this list of candidate asanas — do not invent or use any asana not listed here:
{candidateLines}

Respond with ONLY a JSON object, no other text, matching exactly this shape:
{{
  "planTitle": "<short descriptive title for this plan>",
  "routine": [
    {{ "order": 1, "asana": "<name exactly as listed above>", "duration_minutes": <integer>, "why": "<one sentence tying it to the student's stated problems>" }}
  ],
  "dietTips": ["<short actionable tip tailored to their stated diet/problems>"],
  "cautions": ["<any relevant caution, especially tied to checked safety flags>"],
  "disclaimer": "This is a general wellness suggestion, not medical advice — consult a healthcare professional for serious or persistent conditions."
}}

Use 4-6 asanas in "routine", ordered as a sensible practice sequence. If any safety flag is set (pregnant, recent injury or surgery, high blood pressure, glaucoma), do not include inversions, deep backbends, or intense core-compression poses relevant to that flag, and say why in "cautions".`);

// LCEL-style chain: prompt -> model. Model is bound with response_format so the plain
// .invoke() below doesn't need to repeat it — same reliable json_object + manual
// JSON.parse pattern as chains/checkPose.js, not withStructuredOutput (see that file's
// comment for why).
const chain = PROMPT.pipe(textModel.withConfig({ response_format: { type: 'json_object' } }));

async function draftPlan({ problems, diet, flags, candidates }) {
  const flagLines = Object.entries(flags || {})
    .filter(([, v]) => v)
    .map(([k]) => k);

  const result = await chain.invoke({
    problems: problems || 'none specified',
    diet: diet || 'none specified',
    flagLines: flagLines.length ? flagLines.join(', ') : 'none',
    candidateLines: candidates.map((c) => `- ${c.asana}: ${c.benefits}`).join('\n'),
  });

  return JSON.parse(result.content);
}

module.exports = { draftPlan };
