# YogaPedia v2

Rewrite described in `ARCHITECTURE.md` (same repo). Three feature layers built: live webcam pose check + a personalized yoga plan drafter (both work standalone, no login needed), and a login-gated weekly schedule + session logging layer on top (coded, needs your own MongoDB Atlas + Clerk credentials to actually activate — see `dev_pending_actions.md`). No MediaPipe, no TensorFlow, no committed model files, no Python at runtime.

**Framework: LangChain.js.** All backend LLM calls (`backend/chains/checkPose.js`, `recommend.js`, `schedule.js`) run through LangChain.js (`@langchain/core` + `@langchain/groq`), not raw `groq-sdk`, and not Python LangChain — see `ARCHITECTURE.md` intro + §9.10 for a real gotcha found while migrating (`withStructuredOutput()` looked right but fails on Groq's strict tool-call validation; using `response_format: json_object` instead).

## Structure
- `backend/` — Express proxy. Holds API keys server-side, exposes:
  - `GET  /api/asanas` — the 12 pose-check labels
  - `POST /api/check-pose` — webcam snapshot → pose name/confidence/correction (optionally restricted to a `poses` list, e.g. today's schedule; optional `language` for spoken-guidance translation — see below)
  - `POST /api/recommend` — one-off: health problems + diet + safety flags → a drafted daily yoga plan (no login needed)
  - `POST /api/schedule`, `GET /api/schedule` (full week), `GET /api/schedule/today`, `POST /api/schedule/repeat` (restart the week's rotation from day1, no LLM call) — login-gated: generate/fetch a personalized rotating weekly schedule (poses + pranayama + walk + curated meals + water target). Regenerating factors in real practice history (struggle-flagged poses get an encouraging cue and a shorter hold time, not dropped) and tapers intensity down the longer a safety flag has stayed active across regenerations (never back up — see `ARCHITECTURE.md` §19).
  - `POST /api/sessions`, `GET /api/sessions` — login-gated: log/fetch completed practice sessions (poses + self-reported pranayama/walk/water completion + optional note)
  - `GET  /api/tts-status`, `POST /api/tts`, `GET /api/tts-voices`, `GET /api/tts-languages` — optional ElevenLabs voice, a curated voice picker, and English/Hindi spoken-guidance translation
  - `POST /api/email-summary/send-test` — login-gated: send yourself a weekly recap email right now (see the automatic version below)
  - `GET  /api/config-status` — which of Groq/ElevenLabs/Mongo/Clerk/Brevo are currently configured
- `frontend/` — React + Vite app. `App.jsx` runs in one of two modes:
  - **Open mode** (no `VITE_CLERK_PUBLISHABLE_KEY` set): the original `PoseCheck.jsx` + `YogaPlan.jsx`, no login.
  - **Authed mode** (Clerk configured): Clerk sign-in → `OnboardingForm.jsx` (first login) or a persistent navbar with — **Today** (`TodayView.jsx`: overview + "Practice now" → `PracticeSession.jsx`, a dedicated screen stepping through today's poses one at a time with a per-pose timer, ending in a wrap-up screen to self-report pranayama/walk/water completion, with water/walk highlighted in their own tinted "wellness" card rather than plain checkboxes), **Plan** (`PlanView.jsx`: the full week, "Edit plan" reopens the onboarding form pre-filled and regenerates — also the one place to add/remove health issues, since a dedicated navbar shortcut for that turned out to be a duplicate of this exact flow), **Activity** (`ActivityView.jsx`: streaks/badges/heatmap, per-pose accuracy trends over your last 10 attempts at each pose, plus a session-history list), **Quick Recommend** (`QuickRecommendView.jsx`: the one-off `/api/recommend` form, previously only reachable in open mode — restoring access for signed-in users too), **Library** (`LibraryView.jsx`: all 12 poses with demo images/benefits, browsable independent of any day's schedule), **Settings** (`SettingsView.jsx`: confidence threshold, voice toggle, a curated ElevenLabs voice picker, spoken-guidance language (English/Hindi), the practice reminder, and — if Brevo is configured — a button to email yourself a weekly summary on demand; shared `localStorage` keys with `PoseCheck.jsx`'s inline controls via `preferences.js`). Explicit "Log out" button in the navbar alongside the Clerk `<UserButton>`.
  - UI is glassmorphic throughout (`App.css`) — frosted translucent cards over a fixed colorful gradient background, one deliberate look rather than a light/dark toggle. Navbar is a visually distinct solid gradient bar with an accent underline (not just another glass card), stays on a single line via horizontal scroll instead of wrapping to a second row.

## Run it

1. Get a free Groq API key: https://console.groq.com
2. Backend:
   ```bash
   cd backend
   cp .env.example .env   # paste your GROQ_API_KEY in here
   npm install
   npm run dev
   ```
3. Frontend (separate terminal):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
4. Open the frontend URL Vite prints (usually http://localhost:5173).
5. With just `GROQ_API_KEY` set, you're in **open mode**: pose check + one-off yoga plan work immediately, no login. See below to also enable ElevenLabs, or login/schedules/sessions.
6. Pose check: click "Turn camera on" — a consent modal explains exactly what happens to the video before anything starts (see Privacy note below). Camera defaults **off** and needs this explicit confirmation every time it's turned on.

## API keys needed
- **`GROQ_API_KEY`** (required) — free from https://console.groq.com, no credit card.
- **`ELEVENLABS_API_KEY`** (optional) — higher-quality spoken guidance. Leave unset and the app falls back to the browser's built-in `speechSynthesis` automatically.
- **`MONGODB_URI`** + **Clerk keys** (optional, both required together to unlock login/schedule/sessions) — see `dev_pending_actions.md` for exact setup steps and env var names. Without them, `/api/schedule*` and `/api/sessions` return a clean `501`, and the frontend just runs in open mode — nothing crashes.
- **`BREVO_API_KEY`** + **`BREVO_FROM_EMAIL`** (optional, also needs Mongo + Clerk configured) — enables the weekly email summary. `BREVO_FROM_NAME`, `WEEKLY_SUMMARY_TEST_EMAIL` (fallback recipient if a user's Clerk email lookup fails), and `WEEKLY_SUMMARY_SEND_TIME` ("HH:MM", checked every few minutes while the server is running) are optional/required-with-caveats — see `backend/.env.example` and `ARCHITECTURE.md` §22.

## Privacy (pose check)
The camera never turns on without an explicit consent step. What the consent modal says, and why it's worded this way:
- Each snapshot (~every 7s while the camera is on) is sent to Groq's cloud API to check the pose — that's real, it's how the feature works.
- It is **not used to train any model**, by this app or by Groq — confirmed against [Groq's actual data-usage policy](https://console.groq.com/docs/your-data), not just asserted.
- This app does not store or log snapshots anywhere.
- Groq doesn't retain request data by default; their policy allows a temporary abuse/troubleshooting log for up to 30 days.
- Turning the camera off stops all of it immediately.

## Notes

**Pose check**
- Pose list (`backend/asanas.js`) is the *real* 14 labels the old `home/model.h5` was trained on, verified by loading `labels.npy` directly. Two duplicate pairs merged, down to 12 distinct poses. `/api/check-pose` accepts an optional `poses` array to restrict the vision-model's candidate list (defaults to all 12) — used by `TodayView.jsx` to send just today's scheduled poses.
- **Pose-name normalization:** the vision model doesn't always echo the candidate name back verbatim (observed `"Tree Pose"` instead of the exact `"Tree Pose (Vrikshasana)"`) — `chains/checkPose.js` normalizes the result back to the exact known string (exact → case-insensitive → substring match → `"Unrecognized"`), so session-log analytics later won't silently split one pose into two labels.
- Vision model: `meta-llama/llama-4-scout-17b-16e-instruct` on Groq's free tier.
- Confidence gating mirrors the old app's >75% threshold; correction feedback (which body part, how to fix it) is new.
- The webcam snapshot sent to the model is mirrored to match what's shown on screen, so left/right in the correction text lines up with what the user actually sees.
- Spoken guidance defaults to browser `speechSynthesis`; upgrades automatically to ElevenLabs (`eleven_flash_v2_5`, their cheapest model) if `ELEVENLABS_API_KEY` is set, and falls back to browser voice again mid-session if any ElevenLabs request fails.
- Demo image panel: all 12 poses have a real, license-checked photo from Wikimedia Commons (the old repo's GIFs had no license info, so replaced rather than reused — see `frontend/public/images/ATTRIBUTIONS.md`). One exception: Vakrasana uses a stylized rendering, no clean photo existed.

**Yoga plan (one-off, no login)**
- Restricted to the same 12 poses as pose-check (`backend/curatedAsanas.js`), not the wider 289-asana `merged_df.csv` corpus — every recommended pose also has a working pose-check + demo image this way. `backend/retrieval.js` + `backend/asanaBenefits.json` (the 289-asana system) are kept but unused — reactivate if the pose library expands.
- Text model: `llama-3.3-70b-versatile` on Groq's free tier.

**Personalized schedule + sessions (login-gated, needs Mongo + Clerk)**
- `OnboardingForm.jsx` collects health problems, days/week, minutes/session (required) plus diet, goal tags, experience level, safety flags (optional) — see `ARCHITECTURE.md` §9.3 for the full reasoning on what's collected and what's deliberately not (no medications/medical history/body metrics, to stay a general-wellness app, not a compliant health app).
- `chains/schedule.js` generates a full week in one LLM call: poses per day (from the 12), a pranayama technique per day (from a curated list of 5 in `backend/curatedPranayama.js`), a daily walk goal, and one water target for the whole plan.
- Two schema simplifications made while implementing (see `ARCHITECTURE.md` §9.4): water target is stored once per schedule, not repeated per day; day keys are generic `day1..dayN`, not weekday names, since onboarding only collects a day *count*.
- `schedules` and `sessionLogs` MongoDB collections are created automatically on first write — nothing to set up by hand in Atlas beyond the cluster itself.
- Not yet built: any frontend view for session history/streaks (the `GET /api/sessions` endpoint exists, no UI consumes it yet), and adaptive re-planning from accumulated logs.

**General**
- Frontend's Vite is pinned to the 5.x line (not the newest 8.x/rolldown-based release) because this machine runs Node 20.15.1, below the 20.19+ the newest Vite requires.
- Installing `@clerk/clerk-react` surfaced a real high-severity authorization-bypass advisory in the version npm resolved by default — patched via `npm audit fix` immediately, before writing any code against it.
