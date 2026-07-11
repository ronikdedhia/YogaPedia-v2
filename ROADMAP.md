# Roadmap — what's next

Not a record of decisions made (that's `ARCHITECTURE.md`) or things only you can do (`dev_pending_actions.md`) — this is the backlog of what to build next, split into real gaps found in the current code, and feature ideas by effort. Items already built have been removed from this file as they land — see `ARCHITECTURE.md` for the full history of what was built and why.

---

## 1. Production-readiness gaps (found by inspecting the current code, not hypothetical)

- **No error monitoring/logging.** Errors currently just go to `console.error` — fine locally, invisible once deployed. Needs at least basic structured logging, ideally an error-tracking service, before real users hit it.

---

## 2. Feature backlog — wellness/health expansion (easy wins)

Deepening the wellness/health angle beyond pose-accuracy tracking. Each reuses an existing pattern (curated-list-constrained-LLM-call, self-report-and-aggregate, or the `Notification`/localStorage pattern from the practice reminder) rather than needing new infrastructure.

1. **Daily yoga-philosophy tidbit** — a curated list (same pattern as `curatedPranayama.js`) shown once/day on Today. Zero LLM cost, just static data + the existing day-rotation logic.
2. **All-time body-part struggle chart** — `getStruggleSummaryForUser` already aggregates this for adaptive re-planning (§18.3); showing the *full* history (not just top-5 recent) in Activity reuses the same trend-bar CSS already built for per-pose accuracy.
3. **Guided breathing animation** — an expanding/contracting circle synced to the pranayama timer. Pure CSS/JS, no new API calls.
4. **Hydration nudges through the day** — same `Notification` + localStorage pattern as `usePracticeReminder.js`, firing more than once a day toward the water target instead of a single practice reminder.
5. **"Swap this pose"** — already flagged as a gap in `ARCHITECTURE.md` §9.9. Given today's pose + a reason ("knee hurts," "too easy"), one Groq call constrained to the same 12 curated poses returns a substitute — same shape as `checkPose`/`draftSchedule`, just a new small chain file.
6. **Pre/post-session mood check-in** — two taps (before/after, 1-5 or emoji scale) added to the existing wrap-up screen, stored in `sessionLogs` next to pranayama/walk/water. Smallest change with the biggest shift in what the app is actually about — makes the weekly email and Activity view about *how you're doing*, not just pose accuracy.

**Explicitly not planned:** BMI/weight tracking — collecting body metrics tips this from "general wellness app" into "needs to be a compliant health app," a conscious line drawn in `ARCHITECTURE.md` §9.3.

---

## 3. Feature backlog — wellness expansion, broader ideas

Wider brainstorm beyond the easy-wins tier above, organized by wellness dimension. Not all equally easy — flagged where something is a bigger lift.

**Nutrition** (building on the curated meals already in `curatedMeals.js`)
- Full week's meal rotation (not just one representative day) — same pattern as pose rotation, just extend selection across `day1..dayN`.
- Simple recipe detail (ingredients + steps) per curated meal instead of just name + one-line why.
- Rough calorie/macro tag per meal — static field, no real tracking system needed.

**Sleep**
- Morning sleep-quality self-report (poor/ok/great), correlated against next-day practice consistency — same self-report-and-aggregate pattern as the mood check-in above.
- Evening wind-down nudge suggesting a specific restorative pose/pranayama before bed.

**Mental health / stress**
- Short guided meditations — a few scripted texts read via the existing TTS pipeline (ElevenLabs/browser voice), no new infra.
- One-line daily gratitude journal — trivial to store, genuinely popular in wellness apps.
- Stress-trend correlation for users who checked "stress relief" as a goal tag.

**Habit-building** (beyond streaks/badges already built)
- Weekly challenges ("practice 4x this week") with their own completion badge.
- Shareable milestone card ("30-day streak!") — reuses the existing text-export pattern, just styled as an image/canvas instead of `.txt`.
- Named levels tied to total sessions (Beginner → Regular → Devoted) shown as a profile badge.

**AI coaching**
- Text-based Q&A with the coach as a stepping stone before a full voice-driven version — same Groq chain pattern as everywhere else, just a chat UI instead of speech-to-text.
- One-time personalized "here's your week and why" note generated at plan creation.

**Wearables/biometrics** — bigger effort, future not near-term
- Apple Health/Google Fit step sync to auto-fill "walk" instead of self-report.
- Heart-rate zone display if a wearable is connected during practice.

**Accessibility**
- Full audio-guided mode — spoken *setup* instructions ("raise your arms overhead"), not just corrections — extends the existing TTS pipeline to a real use case for visually impaired users.
- High-contrast/larger-text mode.

**Safety**
- Enforced short warm-up before intense poses for beginners.
- A calming guided exit sequence if a session needs to stop mid-practice.

---