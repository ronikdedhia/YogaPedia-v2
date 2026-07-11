# YogaPedia v2 — Architecture Plan

> **Framework decision: LangChain.js — done.** All backend LLM orchestration (vision pose-check, recommendation/plan drafting, weekly schedule generation) runs on **LangChain.js** (`@langchain/core` + `@langchain/groq`) in the existing Node/Express backend — **not** Python LangChain. This was an explicit fork to resolve: Python LangChain would mean rewriting the backend in Python, reintroducing the exact pip/venv/version-pinning pain this whole rewrite exists to escape (see the rewrite goal right below). Migration is complete — `backend/llm.js` + `backend/chains/*.js`; `groq-sdk` was removed as a direct dependency entirely. See §9.10 for a real technical finding from doing this migration (why `withStructuredOutput()` was rejected in favor of `response_format: json_object`).

Rewrite goal: kill the Python/Keras/TensorFlow/MediaPipe version dependency hell from the original repo (`ronik/YogaPedia`), drop the server-side webcam bug (`cv2.VideoCapture(0)` was opening a camera on the *server*, not the user's browser), and replace the custom-trained model with a hosted, swappable vision-LLM. Also replace the Streamlit + scikit-learn TF-IDF recommender with a JS frontend + Groq-backed recommendation engine — same "no exact-version dependency" philosophy applied to both ML surfaces in the app. Optimize for "least moving parts," not raw real-time framerate.

**Status: pose-check and yoga-plan recommender** are built and verified against the real Groq API. **§9 (accounts/schedule/sessions) is now also fully coded and boot-tested** — server starts clean, degrades gracefully (clear `501`s) without Mongo/Clerk configured — but **not yet exercised end-to-end**, since neither a live MongoDB Atlas cluster nor a live Clerk app existed while writing it. See `dev_pending_actions.md` for the exact steps to activate and test it once those credentials exist.

---

## 1. Decisions locked in (updated with what building it actually revealed)

| Question | Decision |
|---|---|
| Continuous frame-by-frame or snapshot? | **Snapshot, interval increased 2.5s → 7s** (see §17.1) — the original 2.5s number turned out to exceed Groq's free-tier 30,000 TPM cap for the vision model once actual per-request image-token cost was measured live. Not true 30fps real-time either way — traded for zero local ML runtime. |
| Own trained model, or existing one? | **Abandoned** `home/model.h5`. Uses a hosted vision-LLM, zero-shot, no fine-tuning. |
| MediaPipe / TensorFlow.js? | **Excluded**, per explicit requirement. No client-side ML runtime at all. |
| Pose classifier candidates evaluated | `dima806/yoga_pose_image_classification` (HF, ViT, 97% acc, Apache 2.0) — rejected: only 9/26 poses, not on free hosted inference, would need self-hosting. |
| Chosen inference provider | **Groq**. Vision: `meta-llama/llama-4-scout-17b-16e-instruct`. Text (recommender): `llama-3.3-70b-versatile`. Free dev tier, no credit card. Rate limit is a real 30,000 TPM cap on the vision model specifically (not just an approximate "~30 req/min") — see §17.1 for the actual math once this was hit live. |
| **Correction** — how many pose-check labels, really? | The plan originally assumed the old README's "26 asanas." **Wrong** — loading `home/labels.npy` directly showed the trained model only covered 14 raw labels, two duplicate pairs (`Lotus`/`padmasana`, `tree pose`/`tree pose 1`) merged down to **12 distinct poses** used in `backend/asanas.js`. |
| Per-limb corrective feedback (arm/leg/posture wrong + how to fix) | **New capability**, old app never had it (confirmed in `home/views.py` — it only ever showed a single label + green/red confidence text, skeleton lines were static-colored, not correctness-coded). Achieved via prompting the vision-LLM directly — no keypoint/angle math needed. Mirrored capture frame to match the mirrored `<video>` display so left/right in the correction text lines up with what the user sees. |
| Recommender (`asanas_predict.py`, Streamlit + TF-IDF) | **Rewritten**, not ported as-is. Old version: 4 fixed text boxes, keyword-only TF-IDF, no reasoning, no safety caveats, `set()`-based dedup that loses ranking. New version asks for **diet + health problems** (not just symptoms) and drafts a structured daily practice plan, not just a flat list. See §4. |
| **Correction** — recommender dataset size | The plan originally assumed 26 rows, small enough to hand entirely to an LLM in one call. **Wrong** — `merged_df.csv` actually has 326 rows / 289 after deduping by name (~183KB of benefit text). Too big for one prompt on Groq's free-tier token-per-minute cap. This forced building the retrieval step that §4.3 originally deferred as "future, not needed yet." |
| Retrieval for the recommender | Built (`backend/retrieval.js`, plain-JS keyword-overlap, no embeddings/ML) for the 289-asana corpus, verified against real queries. **Currently not used** — see next row. |
| **Update** — recommender scope narrowed back to 12 | Decided to restrict `/api/recommend` to the same 12 poses as pose-check (not the full 289), so every recommended asana also has a working pose-check + demo image — no half-supported poses in a generated plan. `retrieval.js`/`asanaBenefits.json` (289-corpus) are kept in the repo but unused for now, not deleted — reactivate when the pose library expands. Benefits text for the 12 lives in `backend/curatedAsanas.js`, written fresh rather than reused from the 289-corpus: checked first, only 4 of the 12 names had a match there, and some matches were wrong (e.g. "Virabhadrasana II" substring-matched the unrelated "Bhadrasana"). |
| Camera privacy | **Camera defaults off.** Turning it on requires an explicit consent modal (not just a plain toggle) stating exactly what happens: each snapshot goes to Groq's cloud API for real-time analysis, is not stored by this app, and — per Groq's published data-usage policy — is not used to train any model and isn't retained by default (Groq may keep a transient abuse/troubleshooting log up to 30 days). Wording was checked against Groq's actual policy before writing it, since an inaccurate privacy claim in a consent modal is a real trust problem. |
| Spoken (TTS) guidance | Uses the browser's built-in `speechSynthesis` — no new API/key. Speaks corrections only (no asana name — reads like a live instructor, not a label announcer), only when the message changes (not every 2.5s if the pose is stable), and never interrupts a sentence already being spoken — if the result changes again mid-speech, only the *latest* instruction is queued next, stale ones are dropped. First utterance is primed inside a user click (a one-time "tap to enable voice" banner) to satisfy the browser's audio-gesture requirement, so no repeated clicking is needed afterward. |
| Demo image library | Old repo's `static/GIF/` assets had **no license/attribution info at all** — replaced entirely rather than reused. All 12 pose-check labels now have a real demo photo sourced from Wikimedia Commons (CC-licensed, attribution recorded in `frontend/public/images/ATTRIBUTIONS.md`), each one visually verified against the actual pose before use. Verification caught real mismatches an automated/title-based search missed: a "Tadasana" candidate had arms overhead (wrong — Mountain Pose is arms at sides), a "Side Plank" candidate turned out to be a different pose entirely. One gap remains: no clean single-subject Vakrasana photo exists on Commons, so it uses a stylized relief-art rendering instead, by explicit user choice. |
| Persistence / database | **Code built** (`backend/db.js`, `models/schedules.js`, `models/sessionLogs.js`) — MongoDB Atlas free M0 tier, chosen because plan output is naturally a JSON document, no relational schema needed. **Not yet activated** — no live Atlas cluster existed while writing it, see §9.4 and `dev_pending_actions.md`. |

---

## 2. Target architecture (as built)

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React + Vite) — frontend/                             │
│                                                                   │
│  Consent modal → getUserMedia() → <video> (mirrored)             │
│  → canvas capture (also mirrored, to match) every 2.5s            │
│  → base64 JPEG → POST /api/check-pose                            │
│                                                                   │
│  Spoken guidance: speechSynthesis, one instruction at a time      │
│                                                                   │
│  Yoga Plan form: problems + diet + safety flags                  │
│  → POST /api/recommend → routine/diet-tips/cautions card UI       │
└───────────────────────────┬───────────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼───────────────────────────────────────┐
│  Express proxy — backend/                                         │
│  — holds GROQ_API_KEY server-side only                             │
│  — GET  /api/asanas       → the 12 pose-check labels                │
│  — POST /api/check-pose   → forwards frame to Groq vision model     │
│  — POST /api/recommend    → retrieval.js shortlists 15 of 289        │
│                              asanas, then Groq text model drafts      │
│                              the plan JSON                            │
└───────────────────────────┬───────────────────────────────────────┘
                            │
                ┌───────────┼──────────────┐
         ┌──────▼──────┐           ┌───────▼─────┐
         │  Groq API   │           │  Groq API   │
         │ vision model│           │  text model │
         │ (pose check)│           │(recommender)│
         └─────────────┘           └─────────────┘

Static data loaded server-side at boot (not sent to the browser):
- backend/asanas.js          — 12 pose-check labels
- backend/asanaBenefits.json — 289 deduped asanas (from merged_df.csv), retrieval corpus
```

No Python at runtime. No committed model binaries. No local GPU/CPU inference. No MediaPipe, no TensorFlow.js.

---

## 3. Components

### 3.1 Frontend — React + Vite (`frontend/`)
- Vite pinned to the 5.x line, not the newest 8.x/rolldown release — this machine runs Node 20.15.1, below the 20.19+ the newest Vite needs. Deliberate choice to avoid recreating the exact version-mismatch pain this whole rewrite exists to escape.
- `PoseCheck.jsx`: consent modal → webcam capture → snapshot loop → result card (pose name, confidence badge, correction) → spoken guidance. Also renders the asana picker + demo image panel side by side with the webcam feed (mirrors the old app's GIF-next-to-live-feed layout).
- `YogaPlan.jsx`: free-text problems + diet fields, safety-flag checkboxes (pregnant, recent injury/surgery, high blood pressure, glaucoma), submits to `/api/recommend`, renders the routine/diet-tips/cautions/disclaimer.
- `asanaGifs.js`: maps all 12 pose-check labels to a CC-licensed Commons demo photo (see `public/images/ATTRIBUTIONS.md`).

### 3.2 Backend — Express proxy (`backend/`)
- Sole job: hold the Groq API key server-side, forward requests, return parsed JSON.
- `GET /api/asanas` — the 12 pose-check labels (single source of truth the frontend fetches, instead of duplicating the list).
- `POST /api/check-pose` — body `{ image: base64 }` → Groq vision model, JSON response `{ pose, confidence, is_correct, body_part, correction }`.
- `POST /api/recommend` — body `{ problems, diet, flags }` → `retrieval.js` shortlists top 15 of 289 candidate asanas by keyword overlap → Groq text model drafts a plan constrained to only those candidates → JSON response `{ planTitle, routine[], dietTips[], cautions[], disclaimer }`.
- `retrieval.js` — plain-JS word-overlap scorer over `asanaBenefits.json`. No embeddings, no ML dependency; verified to return topically relevant results on real queries.

### 3.3 Data
- `backend/asanas.js` — the 12 real pose-check labels (ground-truth checked against `labels.npy`, not assumed from the README).
- `backend/asanaBenefits.json` — `merged_df.csv` converted to JSON and deduped by asana name (326 rows → 289 unique), used only as the recommender's retrieval corpus, never shipped to the browser.
- `frontend/public/images/` — 12 CC-licensed demo photos from Wikimedia Commons, replacing the old repo's unlicensed `static/GIF/` assets entirely (see `ATTRIBUTIONS.md` there for required credit).
- No database yet (see open item in §1) — plans are generated on demand, not persisted.

### 3.4 Hosting/deploy
- Frontend: static build → Vercel / Netlify / GitHub Pages (not yet deployed, runs locally via `npm run dev`).
- Backend: currently a plain Node/Express process (`npm run dev`); can move to a Vercel/Netlify serverless function later without changing the route logic.

---

## 4. Recommendation engine (Streamlit → JS + Groq, now expanded to a full plan drafter)

### 4.1 What was wrong with the old one
`asanas_predict.py` (Streamlit): 4 fixed free-text boxes, TF-IDF vectorizes the `Benefits` column, cosine similarity picks top matches, `list(set(...))[:5]` dedups. Concrete problems:
- **Keyword-only matching.** "lower back ache" won't match a benefits row that says "back pain" unless the exact stem overlaps.
- **No explanation, no safety awareness, no diet input at all.**
- **`set()` dedup silently loses ranking.**
- **Separate app** (Streamlit, its own port) instead of part of the main product.

### 4.2 What was actually built
Scope grew from "recommend 5 asanas" to "draft a short daily practice plan" once asked for, plus diet as an input, not just symptoms:
- **Frontend (`YogaPlan.jsx`):** free-text "health problems" field, free-text "diet" field, and checkboxes for safety flags (pregnant, recent injury/surgery, high blood pressure, glaucoma).
- **Retrieval (`retrieval.js`):** the corpus turned out to be 289 asanas, not 26 as originally assumed — too big to send whole to the LLM within Groq's free-tier token-per-minute limit. A plain keyword-overlap scorer (no embeddings needed at this scale either) shortlists the top 15 relevant candidates first.
- **Backend (`POST /api/recommend`):** builds a prompt with only those 15 candidates + the user's problems/diet/flags, asks Groq's text model (`llama-3.3-70b-versatile`) for strict JSON:
  ```json
  {
    "planTitle": "...",
    "routine": [{ "order": 1, "asana": "...", "duration_minutes": 5, "why": "..." }],
    "dietTips": ["..."],
    "cautions": ["..."],
    "disclaimer": "..."
  }
  ```
  Explicitly instructed to only pick from the given candidates (no hallucinated asana names) and to avoid inversions/deep backbends/intense core work when a relevant safety flag is checked.
- **Verified against the real API**: a test query ("lower back pain and work stress" + "mostly vegetarian, losing weight" + high blood pressure flag) returned a 6-step routine with sensible reasoning and correctly flagged the blood-pressure caution.
- **Frontend result UI:** ordered routine cards (asana, duration, why), diet tips list, cautions block, persistent disclaimer — not a bare text list.

### 4.3 What this removes
- Streamlit (separate app/port entirely gone), scikit-learn, pandas.
- The 4-fixed-textbox UX and silent `set()`-based dedup bug.

---

## 5. What gets deleted from the old repo
- `home/model.h5`, `model.h5` (root), `labels.npy` (root + `home/`), `home/sitting.npy` — all training artifacts, no longer needed.
- Django (`yogaproj/`, `home/` app, `manage.py`, `db.sqlite3`) — replaced by the frontend + Express proxy.
- `mediapipe`, `keras`, `tensorflow`, `opencv-python`, `scikit-learn`, `pandas`, `streamlit` — no longer dependencies anywhere.
- `asanas_predict.py` (Streamlit) — fully replaced by `/api/recommend` + `YogaPlan.jsx`, per §4.
- Committed `__pycache__/`, `db.sqlite3` — clean out of git history if repo size matters (BFG / `git filter-repo`).
- `static/GIF/` — no license/attribution info existed for any of these assets; replaced entirely by 12 CC-licensed Commons photos (see §6, `frontend/public/images/ATTRIBUTIONS.md`) rather than carried forward.

## 6. What gets reused as-is
- `merged_df.csv` — converted to JSON and deduped, still the source data, now consumed by keyword retrieval instead of a TF-IDF vectorizer.
- The pose taxonomy — same asanas, just served from `/api/asanas` instead of Django templates.
- Nothing from `static/GIF/` was reused — see §5, those assets had no license info and were replaced entirely with properly attributed Commons images.

---

## 7. Known tradeoffs (explicit, not hidden)
- **Not true real-time.** 2.5s snapshot cadence, not continuous frame tracking. Acceptable since yoga poses are held, not fast motion.
- **Correction text is LLM-generated, not geometrically verified.** No joint-angle math — accuracy/consistency of "which limb is wrong" depends on the vision-LLM's visual reasoning, not a guaranteed-correct calculation.
- **Recommendation/plan reasoning is also LLM-generated, not clinically validated.** Disclaimer is mandatory in the UI, not optional.
- **Retrieval is keyword-overlap, not semantic.** Works well enough at 289 short documents (verified on real queries) but will miss pure synonym cases with zero word overlap (e.g. a query using only medical terminology that never appears in the benefits text). An embeddings-based upgrade is the natural next step if this becomes a problem in practice, not before.
- **Free tier rate limits are real.** ~30 req/min ceiling on Groq free dev tier per model — fine for a single user, would need paid tier for multiple concurrent users. Vision and text calls use separate models/limits so they don't compete with each other.
- **No skeleton/landmark visual overlay** — old app's skeleton lines were cosmetic only anyway (not tied to correctness), so nothing functional was lost by dropping them. Demo images are now covered for all 12 poses (properly licensed, replacing the old unlicensed set), except Vakrasana which uses a stylized rendering rather than a photo since none existed.
- **The one-off `/api/recommend` plan is never saved** — regenerated fresh each time, by design (it's the no-login quick-check path). The login-gated schedule (§9) *is* persisted, code-complete, just not yet activated against a live Mongo cluster.

---

## 8. Spoken guidance (TTS) — decision and why

Options actually researched, not just assumed:

| Option | Verdict |
|---|---|
| Browser `speechSynthesis` (built in) | **Default, always available.** Free, zero setup, but voice quality depends entirely on the user's OS/browser. |
| Groq TTS (`orpheus-v1-english`) | Rejected — no free tier at all, $22-40/M chars. Would break the "everything free" pattern used everywhere else. |
| Sarvam AI | Rejected for now — free allowance is a one-time credit (~₹1,000, not recurring monthly), and its card-on-signup requirement is unconfirmed. Good option if Indian-language voices are ever needed. |
| Kokoro / CosyVoice / Qwen3-TTS (open-weight, HF) | Rejected — genuinely free but only if self-hosted; user explicitly wants a managed API + key, not self-hosting. |
| Whisper, Wispr Flow | Not applicable — both are speech-*to*-text, wrong direction. |
| GreyLabs | Not a TTS product at all — enterprise call-analytics company, unrelated. |
| **ElevenLabs** | **Chosen.** Confirmed no credit card required for the free tier (straight to dashboard). 10,000 characters/month, resets monthly (real recurring quota, not a one-time credit). Best voice quality of everything compared. |

**Implementation:** `ELEVENLABS_API_KEY` is optional in `backend/.env`. `GET /api/tts-status` reports whether it's configured; the frontend calls `POST /api/tts` (server holds the key, proxies to ElevenLabs) when enabled, and falls back to browser `speechSynthesis` automatically — both when the key is simply absent, and mid-session if any ElevenLabs request fails (e.g. monthly quota exhausted), so guidance never goes silent. This also doubles as the user's usage control: adding/removing the key in `.env` turns ElevenLabs on/off without touching code.

Model used: `eleven_flash_v2_5` — confirmed the cheapest ElevenLabs model (0.5x credits per character vs. standard models), also lowest latency. At ~45 characters per spoken instruction average, the free tier covers roughly **440 instructions/month** (up from ~220/month on the default model) — since corrections are only spoken when they change (not every 2.5s), that's realistically enough for regular daily practice before hitting the monthly cap.

`ELEVENLABS_VOICE_ID` defaults to an example ID pulled from ElevenLabs' own current API docs — **not verified against a live account** (no key was available to test with). Treat it as a starting point; replace with a real voice ID from your own ElevenLabs voice library once you have an account, if the default errors.

---

## 9. Accounts, personalized schedule, and analytics — coded, not yet activated

**Status: all coded and boot-tested, not yet exercised against real Mongo/Clerk credentials** (neither existed while writing this — see `dev_pending_actions.md` for exact activation/test steps once they do).

### 9.1 Auth — Clerk
Clerk handles login/session on the frontend (`@clerk/clerk-react`, `frontend/src/App.jsx`). Backend (`backend/auth.js`, `@clerk/express`) verifies the Clerk session token to get a stable `userId`. **Clerk only stores identity** — schedules, logs, and any other app data live in MongoDB, keyed by that `userId`, not duplicated into Clerk.

**Graceful degradation, both directions:** if `VITE_CLERK_PUBLISHABLE_KEY` (frontend) or `CLERK_SECRET_KEY`+`CLERK_PUBLISHABLE_KEY` (backend) aren't set, the app runs in **open mode** — no login screen, just the original pose-check + one-off yoga-plan form built earlier this session. Auth-protected routes (`/api/schedule*`, `/api/sessions`) return a clean `501` rather than crashing when Clerk isn't configured — same guard pattern used for Groq/ElevenLabs/Mongo throughout this backend.

**Security note:** installing `@clerk/clerk-react` surfaced a real high-severity advisory (authorization bypass when combining organization/billing/reverification checks) in the version npm resolved by default — patched immediately via `npm audit fix` (non-breaking) before writing any code against it, since this is the auth library itself.

### 9.2 First-login flow
Whether a user is "first time" is determined by whether a `schedules` doc exists for their Clerk `userId` — no doc → onboarding form; doc exists → straight to "today's poses." No separate "is this your first login" flag needed.

### 9.3 Onboarding form fields
Expands the existing `YogaPlan.jsx` form (which was built for a one-off query, not a whole week):

**Required:**
- Health problems / goals (free text) — existing field
- Days per week available (3/4/5/6/7) — determines the week's rotation
- Minutes per session (10/20/30/45) — determines how many poses fit per day and how long each is held

**Optional:**
- Diet (free text) — existing field
- Goal tags (multi-select: flexibility, stress relief, better sleep, weight management, back/joint health, general fitness) — clean categorical signal alongside the free-text problems, more reliable for the LLM than prose alone
- Experience level (beginner/intermediate/advanced, default beginner) — calibrates hold-time/intensity
- Safety flags (pregnant, recent injury/surgery, high blood pressure, glaucoma) — existing field

Deliberately **not** collecting: medications, detailed medical history, height/weight for BMI-style calculations — that pushes this from "general wellness app" into "needs to be a compliant health app," which isn't the goal.

### 9.4 Database — MongoDB Atlas
- **Provisioning:** the user creates the cluster themselves on their **personal** Atlas account. The MongoDB MCP tools connected in this environment belong to their **company's** MongoDB — explicitly NOT used to provision anything for this project (never invoked).
- Free (M0) tier limits, confirmed from MongoDB's docs: 500MB total storage, 500 collections max across 100 databases, 500 connections, 100 ops/sec. For this app's scale (a couple of collections, small JSON documents), the practical constraint is nowhere near either cap — plan documents are ~1-2KB each, so 500MB alone holds hundreds of thousands of them.
- **Collections (2, code in `backend/db.js` + `backend/models/*.js`):** neither needs manual creation in Atlas — MongoDB creates a collection automatically on its first insert.
  - `schedules` — one doc per user, upserted by `userId`: `{ userId, createdAt, updatedAt, planTitle, waterTargetLiters, onboarding: {problems, diet, goalTags, experienceLevel, daysPerWeek, minutesPerSession, flags}, days: { day1: {poses: [{order, asana, duration_minutes, why}], pranayama: {technique, duration_minutes, why}, walk: {duration_minutes, why}}, day2: {...}, ... }, dietTips, cautions, disclaimer }`. **Two changes from the original sketch, made while implementing:** (1) `waterTargetLiters` lives at the top level, not repeated per day — it's a general daily target, doesn't meaningfully vary day to day; (2) day keys are generic `day1`..`dayN`, not `mon`/`tue` — onboarding only collects a *count* of days per week (§9.3), not which specific calendar days, so there was nothing to map weekday names onto.
  - `sessionLogs` — one doc per **completed session** (not per 2.5s snapshot — that would be far too noisy for analytics): `{ userId, date, dayOfWeek, poseResults: [{asana, finalConfidence, wasCorrect, bodyPartFlagged}], completedAt }`.
- `GET /api/schedule/today` picks which stored day applies "today" via a simple rotation: days elapsed since the schedule's `createdAt`, modulo `daysPerWeek`. Not aware of which calendar days the user actually practiced on (e.g. skipped days aren't detected) — a real adherence-aware scheduler is future work, see §9.9.
- **Operational note:** a `Socket 'secureConnect' timed out` error when running the backend locally almost always means the machine's current public IP isn't on Atlas's Network Access allowlist (Atlas silently drops unlisted-IP traffic rather than erroring cleanly, hence the full 30s hang) — check `curl ifconfig.me` against Atlas → Network Access. Also check the cluster isn't auto-paused (free tier pauses after inactivity).

### 9.5 Pose scope for schedule + recommendations — currently 12, not 289
Decided (superseding an earlier "open to all 289" answer, revisited once the demo-image and vision-check-prompt consequences were spelled out): **restrict the schedule and `/api/recommend` to the same 12 poses that already have a demo image and a tested vision-check prompt.** Expand later. This is implemented already — see §4 and `curatedAsanas.js`.

### 9.6 Schedule generation — one LLM call, rotating weekly
Not a single flat list — a plan assigns poses per day across however many days the user chose (§9.3), each day's total duration matching their chosen minutes/session. No separate scheduling algorithm: `backend/chains/schedule.js` is one LangChain.js prompt fed problems + diet + goal tags + experience level + safety flags + daysPerWeek + minutesPerSession + the 12 candidate asanas + the curated pranayama list, asked to return a `days` object directly — the LLM handles day-distribution and variety (repeating a pose more often across the week if it's especially relevant to the stated problem), not custom code. Live-tested: a 3-day/week, 20-min/session request for "lower back stiffness and stress" + high-blood-pressure flag correctly produced 3 days, poses roughly matching the time budget, and the right caution.

`/api/check-pose` now accepts an optional `poses` array in the request body to restrict the vision-model candidate list (defaults to the full 12 if omitted) — `frontend/src/PoseCheck.jsx` accepts a `posesOverride` prop that both restricts its own picker UI and sends that list through. `TodayView.jsx` passes today's actual scheduled poses. Smaller candidate set per check, per the original reasoning in §9.6 (untested for accuracy improvement specifically, but structurally in place).

**Bug found + fixed while testing this:** the vision model doesn't always return the candidate pose name verbatim, even when explicitly told to — observed it return `"Tree Pose"` instead of the exact candidate string `"Tree Pose (Vrikshasana)"` when given a restricted 3-pose candidate list. Silently accepting that would split one pose into two different labels in session-log analytics later. Fixed in `chains/checkPose.js` with a `normalizePoseName()` step: exact match → case-insensitive match → substring match → falls back to `"Unrecognized"` if none confidently match, rather than trusting the model's raw string. Re-tested 3x after the fix, consistently correct.

### 9.7 Beyond poses — pranayama, walking, water
The daily plan covers more than asanas, per `backend/curatedPranayama.js` + `chains/schedule.js`:
- **Pranayama (breathing).** Not visually checkable (no pose to photograph), so plan text only — "X min of [technique] — [benefit]." **Curated list of 5** (Anulom Vilom, Bhramari, Ujjayi, Kapalabhati, Sitali), written fresh rather than left to the LLM's free choice, same reasoning as the 12 asanas.
- **Walking.** A duration/goal line per day (e.g. "10 min brisk walk"), no pose-check involved.
- **Water intake.** A general target in liters, set once per schedule (not per day) — confirmed live-tested output: 2L/day for a beginner-level request.

### 9.8 Endpoints — built
- `POST /api/schedule` — generate + save a weekly schedule for the logged-in user, from onboarding answers. Requires Groq + Mongo + Clerk all configured; returns the specific missing-config error otherwise.
- `GET /api/schedule/today` — today's assigned poses + pranayama + walk + water target, via the day-rotation logic in §9.4.
- `POST /api/sessions` — log one completed session.
- `GET /api/sessions` — fetch history for streak/trend analytics (computed in plain code from stored logs, not another LLM call) — endpoint exists, no frontend analytics view built yet (that's §9.9).
- `GET /api/config-status` — reports which of Groq/ElevenLabs/Mongo/Clerk are configured, `{ groq, elevenLabs, mongo, clerk }` — added for debugging/frontend use.

### 9.9 Feature ideas raised, for later (still not built)
- Adherence streaks + a calendar heatmap of session history (backend `GET /api/sessions` exists; no frontend view yet).
- Adaptive re-planning: periodically feed aggregated struggle data (which poses/body-parts get flagged most often in `sessionLogs`) back into the plan-drafting prompt to adjust the next week's schedule.
- Per-pose trend line ("correct in 8 of your last 10 sessions") — plain aggregation over stored logs.
- Skip/swap a pose in today's session for a same-benefit substitute (one more LLM call, constrained to the 12).
- Adherence-aware day rotation (currently just cycles day1..dayN by calendar days elapsed, doesn't know if a day was actually skipped — see §9.4).

### 9.10 Framework — LangChain.js, migration complete
`backend/llm.js` (shared `ChatGroq` instances for vision + text) and `backend/chains/{checkPose,recommend,schedule}.js` — all three LLM call sites now go through LangChain.js. `groq-sdk` removed as a direct dependency.

**Real finding from doing this migration:** `ChatGroq.withStructuredOutput()` looked like the obviously-correct LangChain-idiomatic choice for guaranteed JSON output, and its type defs even expose a `profile.imageInputs` capability flag confirming vision support. But live-tested, it routes through Groq's server-side tool-calling schema validation, which **hard-fails the whole request (400)** if the model emits a numeric-looking string (e.g. `"90"`) for an integer field — no partial result, no graceful coercion, just an error. This happened on the very first live test. Reverted to the same `response_format: { type: 'json_object' } ` + manual `JSON.parse()` pattern the app used before the migration (proven reliable across dozens of live calls this session) — just invoked through LangChain's `ChatGroq`/`HumanMessage`/`ChatPromptTemplate` instead of raw `groq-sdk`. Also note: the image content block had to be the older OpenAI-style `{type: 'image_url', image_url: {url}}` shape — the newer LangChain-core `{type: 'image', url, mimeType}` block was rejected by Groq's actual API (400) when tested live, despite being the "current, non-deprecated" format per `@langchain/core`'s own type definitions.

---

## 10. UI direction — glassmorphism, and first gamification features

`frontend/src/App.css` rewritten: a fixed dark gradient background with layered colorful radial-gradient glows, and every card-like surface (`pose-check`, `yoga-plan`, `consent-modal`, `progress-card`) using `backdrop-filter: blur()` + translucent backgrounds for the frosted-glass look. **Deliberately one committed look, not light/dark themed** — glassmorphism needs a busy, colorful backdrop to read as "glass" at all; toggling to a plain light theme would just look flat. No JSX/class-name changes were needed for existing components, only variable/selector values in the stylesheet.

First two items from the gamification backlog (ROADMAP.md §2) built on top:
- **Streak counter, longest streak, session count, milestone badges, and a ~12-week activity heatmap** — computed entirely client-side from the existing `GET /api/sessions` (no new backend endpoint at the time). Originally `Progress.jsx` embedded in `TodayView.jsx`; superseded by `ActivityView.jsx` as its own tab, see §11.
- **Correct-pose chime** — `PoseCheck.jsx`, Web Audio API (two-tone sine chime, no external audio file), fires once on the transition into a correct pose rather than repeatedly while held.

See ROADMAP.md §2 for the known UTC-date-boundary simplification in the streak/heatmap calculation.

---

## 11. First real user testing pass — multi-page navigation, practice timer, manual activity tracking

The user actually signed in and used the app (first real end-to-end run, past the point automated testing could reach — see §12) and gave concrete feedback, built here:

### 11.1 Navigation — tabs, not one long page
`App.jsx`'s `AuthedApp` now renders a persistent tab bar (Today / Plan / Activity) instead of a single long scrolling page. Deliberately **not** `react-router` — no requirement surfaced for shareable URLs or browser back/forward, so a plain `tab` state variable in `AuthedApp` is the "least moving parts" choice. Revisit if that requirement ever shows up.

### 11.2 Practice is now its own screen, with a per-pose timer
`PracticeSession.jsx` (new) — clicking "Practice now" on the Today overview switches to a dedicated screen that steps through today's poses one at a time (not all shown in the picker at once), each with a running timer (`PoseCheck.jsx`'s new `targetDurationMinutes` prop) that starts the moment the camera turns on and counts up against that pose's assigned duration — doesn't force-stop at the target, just visually flags it (turns green) once reached. "Next pose"/"Previous pose" buttons move through the sequence; camera stays running across pose switches (better UX than re-consenting each time) — the timer resets because its effect depends on `[cameraOn, targetDurationMinutes]`, not `cameraOn` alone.

### 11.3 Manual completion tracking for pranayama/walk/water
These three aren't camera-checkable (no pose to verify), so after the last pose, `PracticeSession.jsx` shows a wrap-up screen: checkboxes for each ("I did my breathing," "I completed my walk," "I drank my water") plus an optional free-text note, self-reported not verified. `POST /api/sessions` extended to accept `pranayamaCompleted`, `walkCompleted`, `waterCompleted`, `note` alongside the existing `poseResults`; `models/sessionLogs.js` stores all of it.

### 11.4 Plan page — view the full week, "edit" = regenerate
`PlanView.jsx` (new) + `GET /api/schedule` (new endpoint — previously only `/api/schedule/today` existed, nothing surfaced the whole week). **Scope decision on "edit":** clicking "Edit plan" reopens `OnboardingForm.jsx` pre-filled with the schedule's saved `onboarding` answers (that form now accepts an optional `initialValues` prop + edit-mode heading/button text); submitting calls the same `POST /api/schedule`, which already upserts by `userId` — so "editing" regenerates the whole week from updated answers, not a granular per-day/per-pose editor. Chosen over building a full drag-and-drop day editor given time/complexity; noted here explicitly as a scope call, not an oversight.

### 11.5 Activity page — daily tracking, not just aggregate stats
`ActivityView.jsx` replaces `Progress.jsx` (deleted) as its own tab rather than embedded in Today. Keeps the streak/badges/heatmap aggregate stats, adds a **session history list** below it — each entry shows date, poses attempted with correct-count, the three manual completion badges (§11.3), and the optional note. This is the "daily activity tracking" page that was asked for.

### 11.6 Real gap closed: unbounded schedule inputs
Found in `ROADMAP.md` §1 while working in this exact function: `POST /api/schedule` only checked `daysPerWeek`/`minutesPerSession` were truthy, not bounded. Fixed — now rejects with `400` unless `daysPerWeek` is an integer 1-7 and `minutesPerSession` is an integer 5-120.

### 11.7 Navbar, quick "Add issue" entry point, explicit logout
Requested right after the above: all pages moved under one persistent, full-width sticky navbar (`App.jsx`'s new `Navbar` component + `.app-navbar` styles) instead of inline buttons above the page content. Added a 4th nav item, "+ Add issue" (`AddIssueView.jsx`) — fetches the current schedule's `onboarding` answers and reopens `OnboardingForm.jsx` pre-filled, same underlying regenerate-the-plan mechanism as Plan → Edit (§11.4), just reachable in one click from anywhere instead of requiring a trip through the Plan tab first. Logout is now an explicit button (Clerk's `useClerk().signOut()`) alongside the `<UserButton>` avatar, not only reachable through the avatar's dropdown.

### 11.8 What's still not verified live
Same wall as §12: only Google OAuth is enabled on the Clerk app, which blocks automated testing. Confirmed via headless Playwright that the app still loads with zero console errors after all these changes (pre-auth screen only — that's the limit of what's automatable here, per §12). **The actual Today → Practice → wrap-up → Plan → Activity → Add issue → Logout flow has not been exercised by anyone yet**, automated or manual — this needs a real click-through same as the rest of §9.

---

## 12. Automated browser verification — how far it could actually go

Neither `chromium-cli` nor Playwright existed in this environment; installed Playwright + Chromium in the scratchpad (not the project, no new project dependency) to drive the real app rather than rely on `curl`-only checks, per this project's own `run` skill.

**Confirmed working, live, in a real headless browser:** the app loads with zero console errors, the glassmorphic background renders, `<ClerkProvider>`/`<SignIn/>` embed correctly and pick up the real Clerk app (branded "Sign in to YogaPedia" card, not a placeholder).

**Hard wall hit:** the Clerk app has only **Google OAuth** enabled as a sign-in method — no email/password. Google actively blocks headless/automated OAuth sign-ins, and no real Google account was available to the automation either way. So the entire authenticated flow (onboarding → schedule → today's practice → session logging, and now §11's practice screen/plan/activity pages) **cannot be verified by automation** — it needs an actual human clicking "Continue with Google." This is a durable constraint, not a one-time gap: every new authenticated feature built from here on inherits the same limitation until either a password-based sign-in method is added to the Clerk app (making automation possible) or verification stays manual by design.

**One real, minor finding from that session:** clicking "Sign up" from the embedded sign-in card navigates away to Clerk's generic hosted Account Portal (`https://steady-corgi-56.accounts.dev/sign-up`), unbranded — because the app has no dedicated in-app `<SignUp/>` route. Not a functional blocker (Google-OAuth-only means "Continue with Google" on the sign-in screen itself handles both new and returning users), but worth knowing if full brand consistency matters later.

---

## 13. Health problems — removable list, not one free-text blob

Requested after real use: the user wanted to remove a specific health issue once recovered from it. The original `problems` field was one free-text textarea (a whole paragraph), which has no addressable unit to remove — fixed by changing it to a list of individually addable/removable strings.

- `OnboardingForm.jsx`: `problems` is now `string[]`, rendered as removable chips (× button per issue) plus an "add one issue at a time" input. `normalizeProblems()` in that file treats an old plain-string value (from a schedule saved before this change) as a single-item array, so existing saved data keeps working without a migration script.
- `backend/index.js`'s `POST /api/schedule`: accepts `problems` as an array (preferred) or a plain string (backward compatible), normalizes to an array, joins with `; ` only when building the LLM prompt (`chains/schedule.js` is unchanged — it still just takes a string). The **array** is what's persisted in `onboarding.problems`, not the joined string, so reopening the form later shows the individual removable issues again, not one blob to hand-edit.
- Tab renamed: "+ Add issue" → **"Health Form"** (`HealthFormView.jsx`, renamed from `AddIssueView.jsx`) — same quick-access pre-filled-form pattern as before, now also supports removal, so the old "add-only" name no longer fit.

---

## 14. Three ROADMAP.md easy wins, built after real live testing

### 14.1 Adjustable confidence threshold
`PoseCheck.jsx`'s `CONFIDENCE_THRESHOLD` was a hardcoded module constant (75). Now a slider (30-95%, step 5) in the pose-check controls, backed by component state persisted to `localStorage` (`yogapedia.confidenceThreshold`) so it survives reloads. `buildSpokenText()` and the correct/incorrect classification both take the threshold as a parameter now instead of reading the module constant directly.

### 14.2 "Repeat this week" — no LLM call
The day rotation in `GET /api/schedule/today` was already `(days elapsed since createdAt) % daysPerWeek` — meaning a plan already repeats forever automatically. What "repeat this week" actually needed was a way to **deliberately restart the cycle from day1 right now** rather than wait for the modulo to wrap back around on its own. `models/schedules.js`'s new `resetScheduleRotation()` just sets `createdAt` to now — no `chains/schedule.js` call, no Groq usage, matching the "trivial, no new LLM call" framing this was requested with. New endpoint: `POST /api/schedule/repeat`. Button lives in `PlanView.jsx` next to "Edit plan."

### 14.3 Real per-pose hold-duration logging
The timer added in §11.2 only ever displayed live — the elapsed value was never captured anywhere. Closed the loop:
- `PoseCheck.jsx` gained an `onElapsedChange(seconds)` callback, fired on every timer tick (and on reset), mirroring the existing `onPoseResult` callback pattern.
- `PracticeSession.jsx` no longer pushes one `poseResults` entry per ~2.5s check callback (which would've meant many rows per pose) — it now tracks only the *latest* check result and *latest* elapsed value in refs, and combines them into exactly one record per pose (`{ asana, targetDurationSeconds, actualHoldSeconds, finalConfidence, wasCorrect, bodyPartFlagged }`) at the moment the user moves to the next pose.
- `ActivityView.jsx`'s session list now sums `actualHoldSeconds` across a session's poses and shows "⏱ Xm Ys held in front of the camera" — guarded so it doesn't show anything for sessions logged before this feature existed (no `actualHoldSeconds` field on those, sums to 0, hidden rather than showing a false "0s").

This closes ROADMAP.md item 5 (real hold-duration tracking) but **not** full session-level start/end timestamps — that's still open, tracked separately.

---

## 15. Four more navbar tabs

Requested after a brainstorm on what tabs to add. Two of these closed real gaps found while thinking it through, not just new features:

### 15.1 Quick Recommend — fixed a real regression
`YogaPlan.jsx` (the one-off recommender, calls the always-public `/api/recommend`) was only ever imported inside `OpenModeApp`. Once Clerk got configured, there was **no path to it at all for signed-in users** — a silent regression, since the backend endpoint kept working fine the whole time, just unreachable from the UI. `QuickRecommendView.jsx` is a thin wrapper reusing `YogaPlan.jsx` as-is (no changes needed there — it never required auth), now also in the authed navbar, with a line distinguishing it from the full weekly Plan.

### 15.2 Library
`LibraryView.jsx` — a browsable reference of all 12 poses (demo image + benefits), independent of any day's schedule. New public endpoint `GET /api/asanas/library` returns `backend/curatedAsanas.js` in full (name + benefits) — the existing `GET /api/asanas` couldn't be reused as-is since `PoseCheck.jsx`'s picker expects a plain name array, and changing its shape would've broken that.

### 15.3 About — fixed a real attribution-visibility gap
The Wikimedia CC-BY/CC-BY-SA licenses on the 12 demo images require visible attribution (§12 of the original build), but that only ever lived in `frontend/public/images/ATTRIBUTIONS.md` — a file in the repo, never rendered anywhere in the actual running app. `frontend/src/attributions.js` mirrors that markdown file's content as data (kept in sync manually, no automated single-source-of-truth yet), rendered by `AboutView.jsx` alongside a short "how this app works" transparency section (Groq, ElevenLabs, MongoDB, Clerk, camera policy).

### 15.4 Settings
Consolidates the confidence-threshold slider and voice on/off toggle (previously only adjustable inline inside `PoseCheck.jsx`'s own controls) into one place. Required extracting the `localStorage`-backed preference logic into a shared `frontend/src/preferences.js` (`getConfidenceThreshold`/`setConfidenceThreshold`/`getTtsEnabled`/`setTtsEnabled`) so `PoseCheck.jsx` and `SettingsView.jsx` read/write the exact same keys — a change in Settings is picked up next time `PoseCheck` mounts, and vice versa. This also **newly persists `ttsEnabled` to `localStorage`**, which previously reset to "on" every time (only `confidenceThreshold` was persisted before this).

---

## 16. Three more ROADMAP.md easy wins

### 16.1 Voice picker — blocked, not built
Real finding, not just deferred: tried to query ElevenLabs' actual `/v1/voices` endpoint live (using the real key already in `.env`) to populate a small picker with verified voice IDs rather than guess more of them (the existing default voice ID was already flagged as unverified — didn't want to compound that). Got a genuine `401`: **the API key is missing the `voices_read` permission scope**. ElevenLabs keys support granular permission scoping, and this one was created without it. Rather than hardcode additional unverified voice IDs (the same problem already flagged once), this is left unbuilt until the key's permissions are widened — a one-time dashboard change, not a code problem.

### 16.2 Practice reminder notification
`frontend/src/usePracticeReminder.js` — a hook mounted once at `AuthedApp` level (not inside `SettingsView.jsx`), so it keeps checking every 30s regardless of which tab is currently active. Fires a browser `Notification` once per day at a user-set time, tracked via `localStorage` (`reminderEnabled`, `reminderTime`, `reminderLastFired` — new keys in `preferences.js`). **Real, inherent limitation, not a bug:** this only works while the app is open in a browser tab — no service worker, so it can't reach the user if the tab/browser is closed. `SettingsView.jsx`'s toggle calls `Notification.requestPermission()` and only turns the preference on if the user actually grants it (shows an explicit error otherwise, rather than silently enabling something that can't fire).

### 16.3 Export plan as text
`PlanView.jsx`'s `formatScheduleAsText()` + `downloadTextFile()` — plain `.txt` via `Blob` + object URL + a programmatic anchor click, no new dependency. **Scope decision:** ROADMAP.md's item said "text or PDF" — went with plain text only; a PDF would need adding a library (e.g. jsPDF) for a feature this small, not worth the new dependency. Verified the formatting logic directly (day-key sorting, all sections) against a sample schedule object before wiring it to the UI.

Navbar was 8 tabs at this point (Today, Plan, Activity, Health Form, Quick Recommend, Library, Settings, About), wrapping to a second row on narrower widths — both since changed, see §17.

---

## 17. Real bugs found from live use, and a UI pass

### 17.1 Groq 429s on normal `/api/check-pose` use — a real capacity-planning miss, not an edge case
Live use surfaced repeated `RateLimitQuotaExhaustedError` (429) from Groq during ordinary pose-check sessions, not heavy/abusive use. The math: the vision model's free-tier cap is a real **30,000 tokens/minute**, and each check-pose request (image + prompt) costs **~2,700-3,000 tokens** per the error headers themselves. At the original 2.5s interval, that's 24 requests/min — **~69,600-72,000 tokens/min needed, 2.3x over the cap**, meaning a 429 was guaranteed within ~15-20 seconds of continuous camera-on use, every time. The original "~30 req/min, fits with headroom" assumption in §1 never accounted for image-token cost specifically. Fixed two ways:
- `frontend/src/PoseCheck.jsx`'s `CHECK_INTERVAL_MS` raised 2500 → 7000, sized to keep worst-case usage (~3,000 tokens/request) at ~25,700 tokens/min — under the cap with real margin, not just barely under it.
- `backend/index.js`'s `/api/check-pose` catch block now checks `err.status === 429` (Groq SDK's `APIError.status`, per `groq-sdk/core/error.js`) and returns a distinct `429` with a calmer message, instead of folding every failure into a generic `502`. The frontend shows "checks will resume automatically in a moment" for this case specifically rather than the same wording used for a genuine failure.

Does **not** add real request throttling (see `ROADMAP.md` §1's rate-limiting gap, still open) — this only fixes the specific "normal single-user use exceeds Groq's own cap" problem, not abuse protection.

### 17.2 `PoseCheck.jsx` stuck on the first pose of a practice session — cosmetic bug hid a real one
Reported symptom: in `PracticeSession.jsx`, the demo image for pose 2 showed pose 1's GIF. Root cause: `PracticeSession` keeps one `<PoseCheck>` instance mounted for the whole session (camera doesn't restart between poses — deliberate, better UX than re-consenting every pose, see §11.2), and just passes a new `posesOverride={[currentPose.asana]}` prop as `poseIndex` advances. `selectedAsana` was only ever set from `posesOverride` once, in `useState`'s initializer, so it never picked up later poses.

**Deeper bug the user hadn't noticed:** the actual vision-check candidate list had the identical staleness problem, and it mattered more. `captureAndCheck`'s `poses` payload closed over `posesOverride` from inside an effect keyed only on `[cameraOn]` — since the camera stays on across the whole session, that closure was never recreated, so `/api/check-pose` kept sending pose 1's name as the (sole) candidate for every later pose too. This wasn't just a wrong GIF — the model was being told what to look for was still pose 1, for the rest of the session.

Fixed with a `posesOverrideRef`, updated via an effect keyed on `posesOverride?.[0]` (a primitive, since `PracticeSession` passes a new array reference every render) rather than the array itself — `captureAndCheck` now reads the ref instead of closing over the stale prop. Same effect also re-syncs `selectedAsana`/`asanaList` so the GIF panel updates in lockstep. Camera stream itself is untouched by this fix — no reconnection/re-consent on pose transitions.

### 17.3 Health Form removed — was a duplicate of Plan → Edit plan, not a distinct feature
§13 added a dedicated "Health Form" navbar tab (`HealthFormView.jsx`) for quick access to editing health issues. Live use surfaced that it was functionally identical to `PlanView.jsx`'s "Edit plan" button — same `OnboardingForm.jsx`, same pre-fill from `GET /api/schedule`'s `onboarding` field, same regenerate-the-whole-plan behavior on submit. Removed the tab and `HealthFormView.jsx` entirely rather than keep two navbar entries pointing at the same underlying flow; health issues are edited from the Plan tab only now. Navbar is 7 tabs as of this change (Today, Plan, Activity, Quick Recommend, Library, Settings, About).

### 17.4 Navbar — single line, visually distinct from content
Two real complaints: the 8-tab navbar wrapped to a second row (`.app-navbar__links` had `flex-wrap: wrap`), and it looked like just another glass card blending into the rest of the page. Fixed in `App.css`: `.app-navbar__links` now `flex-wrap: nowrap` with `overflow-x: auto` (scrolls instead of wrapping on narrow viewports — true fixed-width mobile layout still unverified, see `ROADMAP.md` §1), smaller per-tab padding/font via a `.app-navbar__links .pose-check__btn` override, and the bar itself switched from the same translucent glass background used everywhere else to a more opaque solid gradient with a 2px accent-colored bottom border and its own drop shadow — reads as a toolbar sitting above the page rather than another content card.

### 17.5 Water/walk completion — dedicated highlighted card, not plain checkboxes
`PracticeSession.jsx`'s wrap-up screen originally rendered pranayama/walk/water as three identical plain `.yoga-plan__flag` checkbox rows, indistinguishable from each other and sitting right above the notes textarea. Per explicit request, water and walk (specifically — not pranayama) now get their own `.wellness-card`: an accent-tinted, bordered box with icons (💧/🚶) and large pill-style toggle buttons that turn green + read "✓ Done" once tapped, instead of small checkboxes. Pranayama stays a plain flag row above it, unchanged — only water/walk were called out as needing to stand out.

---

## 18. ROADMAP.md §1 gaps closed, plus two medium-effort features built

### 18.1 `poses` array in `/api/check-pose` — now bounded and validated
Was previously accepted as-is with no length or content check — a bad request could inflate the vision prompt sent to Groq arbitrarily. `backend/index.js` now rejects (`400`) unless `poses` is a non-empty array of at most 12 (the known asana count) entries, and every entry exactly matches a name in `backend/asanas.js`. Live-tested: an unrecognized name and an oversized array both correctly return `400` with a specific message; a valid restricted list still works as before.

### 18.2 Real per-IP rate limiting added (`express-rate-limit`)
The client-side pacing fix in §17.1 only addressed one endpoint's own request rate — it did nothing to stop a runaway script or anyone else hitting the API directly. Added `express-rate-limit` in front of the four quota-spending endpoints specifically (not every route — `GET` endpoints like `/api/schedule/today` or `/api/sessions` don't call Groq/ElevenLabs, so weren't included):
- `/api/check-pose` — 20/min per IP (above the client's own ~8.5/min pace, so it doesn't interfere with normal use, but well below what would meaningfully dent the Groq TPM budget from one IP).
- `/api/recommend` and `POST /api/schedule` — 10/min per IP (both single user-triggered actions, never polled).
- `/api/tts` — 20/min per IP.

Live-tested by firing 11 rapid requests at `/api/recommend`: the 11th came back `429` as expected, confirming the `max: 10` limiter actually engages (earlier requests in that same burst returned `502`, unrelated — Groq itself rate-limited the test account from the rapid-fire calls, a good real-world confirmation that this kind of burst is exactly what needed guarding against). Still doesn't cover `/api/schedule`'s `GET` routes or `/api/sessions` — not needed, they're plain Mongo reads with no external quota at stake.

### 18.3 Adaptive re-planning — built
Closes the item flagged since §9.9. `backend/models/sessionLogs.js` gained `getStruggleSummaryForUser(userId)` — plain-code aggregation (no LLM call) over the user's last 20 stored sessions, surfacing poses marked incorrect in ≥40% of at least 2 attempts, each with its most commonly flagged body part. `backend/chains/schedule.js`'s prompt now includes this as "practice history" and is explicitly instructed not to drop a struggled-with pose from rotation, but to fold an encouraging cue about the flagged body part into that pose's `"why"` and lean toward a shorter hold time for it. `backend/index.js`'s `POST /api/schedule` fetches the summary and passes it through — a no-op the very first time a user generates a plan (no logs yet, prompt says so explicitly rather than sending an empty list). Live-tested directly against `chains/schedule.js`: seeded a fake struggle record for "Tree Pose (Vrikshasana)" (4 of 5 attempts incorrect, "left ankle" flagged) and the generated plan's `why` field for that pose came back referencing the left ankle specifically, confirming the model actually uses the signal rather than ignoring it.

### 18.4 Per-pose accuracy trends — built
Closes the "correct in 8 of your last 10 sessions" item. `frontend/src/ActivityView.jsx`'s new `computePoseTrends()` — same client-side-aggregation-over-`GET /api/sessions` pattern as the existing streak/heatmap code, no new backend endpoint. Since sessions arrive newest-first, taking the first 10 `poseResults` entries per asana across sessions (in order) gives the most recent 10 attempts at that specific pose without needing timestamps per attempt. Rendered as a small labeled progress bar per pose (red→green gradient fill), worst-accuracy-first, only shown once a pose has ≥2 attempts (avoids a single miss reading as a 0% "trend").

### 18.5 Voice picker — re-confirmed still blocked
Re-tested `/v2/voices` live against the real key in `backend/.env` after being told the key was "added" — still a `401`, identical `missing_permissions` / `voices_read` error as before. The key itself was never the blocker; the specific `voices_read` permission scope on that key is, and that's a dashboard change, not something re-adding the key value fixes. Still unbuilt for the same reason as §16.1 — not fabricating voice IDs to route around a permissions gap.

### 18.6 Voice picker — built, once the permission was actually added
User added the `voices_read` scope (`Voices` row → `Read`, in ElevenLabs' per-key permission editor — confirmed via screenshot it's a per-capability grid, not a single toggle). Re-tested `/v2/voices` live: `200`, 10 real premade voices on the account. Built from there, same "curated, not the full catalog" pattern as `curatedAsanas.js`/`curatedPranayama.js`:
- `backend/curatedVoices.js` — 4 voices hand-picked from the live 10 for fitting a calm live-instructor tone (skipped ones like "Fierce Warrior"/"Social Media Creator" as tonally wrong). The existing `ELEVENLABS_VOICE_ID` default (George) was, satisfyingly, confirmed to be a real voice on the account this time.
- `GET /api/tts-voices` — new public endpoint, returns the curated list, or `[]` if ElevenLabs isn't configured (frontend just hides the picker rather than erroring).
- `POST /api/tts` now accepts an optional `voiceId`, whitelisted against `curatedVoices.js` before being forwarded into the ElevenLabs URL — never passes an arbitrary client-supplied ID straight through.
- `frontend/src/preferences.js` gained `getVoiceId`/`setVoiceId` (empty string = server default); `SettingsView.jsx` renders the picker only when `GET /api/tts-voices` returns a non-empty list and spoken guidance is on; `PoseCheck.jsx`'s `speakViaElevenLabs` reads the stored preference and sends it along.
- Live-tested end to end: `GET /api/tts-voices` returns the 4 curated entries, and `POST /api/tts` with an explicit non-default `voiceId` (Sarah) returns a real playable MP3 (confirmed via `file`, not just a 200 status).

### 18.7 CORS lockdown — dropped from scope
Explicitly told to drop this (not deprioritized, dropped) — removed from `ROADMAP.md`. Still true that `app.use(cors())` currently allows any origin, worth knowing if this ever gets deployed publicly, but not being tracked as backlog per that instruction.

---

## 19. Injury-aware auto-adjustment — built

Closes the ROADMAP item: a safety flag (pregnant, recent injury/surgery, high blood pressure, glaucoma) previously only ever influenced the *single* regeneration where the prompt happened to mention it — nothing carried forward across regenerations, so staying appropriately conservative over consecutive weeks depended entirely on the LLM happening to infer that each time, with no memory between calls.

`backend/safetyTapering.js` (new):
- `computeFlagHistory(prevHistory, flags)` — tracks `{ firstSetAt, consecutiveWeeks }` per currently-checked flag in the schedule doc itself. A flag not checked this time is dropped entirely (not just decremented) — unchecking a resolved injury resets its taper rather than leaving a stale streak sitting around.
- `computeIntensityTier(safetyFlagHistory)` — three deterministic tiers keyed on the longest-running active flag's week count (1-2 weeks → "cautious", 3-4 → "gentle", 5+ → "very gentle"), each capping max pose-hold and pranayama minutes.
- `clampPlanIntensity(plan, tier)` — hard-clamps the LLM's returned plan to the tier's caps regardless of whether the prompt instruction was actually followed.

**Real bug caught by testing before shipping:** the first version had the tiers backwards — intensity *loosened* the longer a flag stayed active (3 min cap at week 1, easing to 5 min by week 5). Caught by literally running `computeFlagHistory`/`computeIntensityTier` through a week-by-week simulation and reading the output, not by inspection. Backwards is actively wrong for a safety feature: a flag still checked after a month isn't evidence it's safe to loosen up (if anything, an injury still flagged after 5 weeks argues for *more* caution), and flags with no natural resolution timeline (pregnancy, high blood pressure, glaucoma) have no reason to auto-relax just because time passed. Fixed so intensity only ever tapers down across consecutive regenerations, never back up — the only way the cap lifts is the user unchecking the flag because it's actually resolved, which is exactly the signal that should lift it.

`backend/chains/schedule.js`'s prompt gained an explicit `taperingLine` (built from the computed tier, not left for the LLM to derive) instructing the exact minute caps and "favor restorative/gentle variants" when a tier is active. `backend/index.js`'s `POST /api/schedule` computes the tier from the previous schedule doc (fetched before this regeneration overwrites it), passes it into `draftSchedule`, clamps the result, and persists `safetyFlagHistory` on the schedule doc for next time.

Live-tested: a 5-consecutive-week `recentInjury` flag correctly resolved to the "very gentle" tier (3 min pose cap, 5 min pranayama cap) and a real `draftSchedule` call with that tier returned poses at 2-3 minutes each and a pranayama at 5 minutes — under cap without `clampPlanIntensity` even needing to intervene, plus a caution message correctly referencing the injury flag.

---

## 20. Diet plan expansion — built

Closes the ROADMAP item: `chains/schedule.js`'s `dietTips` were free-text one-liners the LLM invented fresh each regeneration ("eat more protein") — no actual meals, and no guarantee of consistency or accuracy since nothing constrained what it could say. `backend/curatedMeals.js` (new) — 13 real meals (breakfast/lunch/dinner/snack), each with `dietTags` (vegetarian/vegan/non-veg/general) and `goalTags` matching the same tags `OnboardingForm.jsx` already collects (flexibility, stress relief, better sleep, weight management, back/joint health, general fitness), same "small curated list, not full free choice" reasoning as `curatedAsanas.js`/`curatedPranayama.js`.

The schedule prompt's output shape changed: `"dietTips": ["..."]` → `"meals": [{"type", "meal", "why"}]`, one representative day's worth (breakfast/lunch/dinner/snack, 4 total) for the whole plan — not per day, same "once per plan, not repeated daily" treatment as `waterTargetLiters` (§9.4). The model is instructed to choose only from the curated list and match `dietTags`/`goalTags` to the student's stated diet and goals, exactly the same candidate-list-constraint pattern already used for asanas and pranayama.

Frontend: `PlanView.jsx`'s rendered section and `formatScheduleAsText()` both updated from `dietTips` to `meals`. **Scoped to the weekly schedule only** — the separate one-off `/api/recommend` (`chains/recommend.js`, `YogaPlan.jsx`) still returns free-text `dietTips`, deliberately unchanged: that endpoint doesn't already use `curatedAsanas.js`/`curatedPranayama.js`'s "candidate list" pattern for anything else either, so changing only its diet output would be inconsistent with the rest of that simpler, one-off feature.

Live-tested: a vegetarian, "weight management + stress relief" request returned 4 meals, all verified to come verbatim from `curatedMeals.js` (checked programmatically, not just by eye), each one respecting the vegetarian tag and tying its `why` to the stated goals.

---

## 21. Multi-language spoken guidance — built (English + Hindi)

Scoped deliberately to **spoken guidance only**, not full UI localization — on-screen text, navbar, forms etc. all stay English. Two languages, not an open-ended list (same "few options" reasoning applied to the voice picker in §18.6).

`backend/chains/checkPose.js`: `checkPose(imageDataUrl, poseNames, language)` — for `language === 'en'` (the default/common case) the prompt is byte-identical to before, so there's no token-cost or behavior change for anyone not using this. For `'hi'`, two extra fields are requested — `body_part_localized`/`correction_localized` — while `pose`/`body_part`/`correction` stay explicitly English-only (the prompt says so directly): those three are used for pose-name matching and `sessionLogs` struggle-summary aggregation (§18.3), and letting them drift into Hindi would silently break both. `SUPPORTED_LANGUAGES` exported for `index.js`'s validation.

`backend/index.js`: `/api/check-pose` accepts optional `language`, validated against `SUPPORTED_LANGUAGES` (400 if not recognized, same strictness as the `poses[]` guardrail). New `GET /api/tts-languages` (mirrors `GET /api/tts-voices`'s pattern) so the frontend picker isn't hardcoding the list twice.

Frontend: `preferences.js` gained `getLanguage`/`setLanguage` (no inline control inside `PoseCheck.jsx` itself, only in Settings — so a plain read-at-mount is enough, unlike `confidenceThreshold` which needs a ref because it has a *live* slider inside the same mounted instance). `SettingsView.jsx` renders the picker only when the backend reports more than one language and spoken guidance is on. `PoseCheck.jsx`'s `buildSpokenText()` now prefers the `_localized` fields when `language !== 'en'`, and a small `FIXED_PHRASES` table covers the three strings that never come from the model at all ("make sure your body is visible," "good, hold the pose," "adjust your posture") — translating only the model-derived text would have left the picker feeling half-done. Browser `speechSynthesis` gets `utterance.lang` set (`hi-IN`) as a best-effort locale hint for OS voice selection; ElevenLabs needs no equivalent change since Flash v2.5 auto-detects language from the text itself.

**Verified live, not just by prompt inspection**, across all three response branches by running real demo images through `checkPose()` directly with `language: 'hi'`:
- Correctly-held pose (`tree-pose.jpg` vs. its own name) → `is_correct: true`, all localized fields correctly `null`.
- Genuinely incorrect pose with a real correction (`side-plank.jpg`) → `correction_localized` came back as grammatical Hindi ("अपने दाहिनी कूल्हे को बाईं ओर के ऊपर रखें, अपने कोर को सक्रिय करें।") matching the English `correction`.
- Unrecognized/no-match case (`tadasana.jpg` against a single mismatched candidate) → English fallback text, localized fields `null` as instructed, confirming that branch wasn't silently broken by the added fields.
- `POST /api/tts` with real Hindi text returned a valid, playable MP3 (44KB, confirmed via `file`), confirming ElevenLabs' auto-detection actually handles it rather than just accepting the text and mangling it silently.

---

## 22. Weekly email summary — built (Brevo)

Closes the ROADMAP item: "Clerk already has the user's email on file, just needs an email provider." Brevo chosen (user's call) — free transactional-email tier, no SDK needed, plain REST (`POST https://api.brevo.com/v3/smtp/email` via the same global `fetch` already used for ElevenLabs).

**Env vars renamed from what was pasted in** — they'd reused naming from an unrelated existing "Daily Bytes" newsletter project: `BREVO_TO_EMAIL` → `WEEKLY_SUMMARY_TEST_EMAIL` (it's a fallback/manual-test recipient here, not a fixed broadcast target — this app emails each user their *own* summary), `NEWSLETTER_SEND_TIME` → `WEEKLY_SUMMARY_SEND_TIME`, and `BREVO_FROM_NAME`'s value corrected from "Daily Bytes" to "YogaPedia".

`backend/email.js` (new):
- `sendBrevoEmail({to, toName, subject, html})` — raw REST call, guarded by `hasBrevoKey` (same pattern as every other optional integration).
- `getUserEmail(userId)` — the one place this backend reads a real email address, via `clerkClient.users.getUser(userId)` (`@clerk/express`'s exported backend client) rather than duplicating email into MongoDB, consistent with §9.1's "Clerk only stores identity" principle.
- `summarizeWeek(sessions)` — plain-code aggregation over the last 7 days of `sessionLogs` (sessions/days practiced, pose accuracy, pranayama/walk/water completion counts) — same "no new LLM call, just aggregate what's already stored" pattern as `getStruggleSummaryForUser` (§18.3), reused here directly for a "poses worth extra attention" section in the email.
- `sendWeeklySummaryForUser(userId, {overrideEmail})` — **tries the real Clerk lookup first**, `overrideEmail` is only a fallback if that lookup fails (not a shortcut that skips it) — this matters because the whole point of the feature is using the real per-user email Clerk already has, not a hardcoded test address.

`backend/weeklySummaryScheduler.js` (new) — genuinely automatic, not a "you have to remember to run this" script. This app has no deployment/cron infrastructure yet (ROADMAP.md), but the backend process is long-running while `npm run dev`/`npm start` is up, so it self-schedules the same way `frontend/src/usePracticeReminder.js` already does client-side: a `setInterval` every 5 minutes checks whether the current time is within a 5-minute window of `WEEKLY_SUMMARY_SEND_TIME`, and for each user with a schedule doc, whether ≥7 days have passed since `schedules.lastWeeklySummarySentAt` (new field, `models/schedules.js`'s `markWeeklySummarySent`/`getAllUserIdsWithSchedule`). Only starts if Brevo + Mongo + Clerk are all configured (all three are load-bearing: content from Mongo, recipient from Clerk, delivery via Brevo) and `WEEKLY_SUMMARY_SEND_TIME` is set. If this ever moves to a real host with an actual cron/scheduled-function primitive, swapping this file out for that is straightforward — the send logic itself (`email.js`) doesn't care who calls it.

`POST /api/email-summary/send-test` (new, login-gated) — lets the signed-in user trigger their own summary immediately rather than waiting for the weekly window, for verification and as a genuine "recap on demand" feature (surfaced as a button in `SettingsView.jsx`). Deliberately does **not** call `markWeeklySummarySent`, so testing it doesn't disturb the real weekly cadence. `GET /api/config-status` gained a `brevo` field alongside the existing three.

**Live-tested, not just boot-tested:**
- `sendWeeklySummaryForUser` with a fake/nonexistent Clerk user ID → Clerk lookup correctly failed and logged, fell back to `WEEKLY_SUMMARY_TEST_EMAIL`, and Brevo accepted the send.
- Same function called with the real Clerk user ID found in the actual `schedules` collection (from real prior testing) → real Clerk lookup succeeded, resolved to the same real email, Brevo accepted the send. Two real emails were sent end-to-end during this verification, not just a dry-run.
- Full server boot with all four integrations configured: `/api/config-status` reports `brevo: true`, and the scheduler logs that it's enabled and watching the configured send window.

---

## 23. About tab removed

Explicit request after reviewing the actual page — removed entirely (`AboutView.jsx`, `attributions.js` deleted, navbar back to 6 tabs). Navbar is down to Today/Plan/Activity/Quick Recommend/Library/Settings.

**Worth knowing, not a reason to reverse this:** §15.3 built this page specifically to close a real gap — the Wikimedia CC-BY/CC-BY-SA licenses on the 12 demo photos require visible attribution, and before that section existed it only lived in `frontend/public/images/ATTRIBUTIONS.md`, a repo file nobody using the running app would ever see. Removing the tab reopens that exact gap — attribution now only exists in that markdown file again, not in the app itself. That file is untouched (still accurate, still there), so nothing is lost from the repo's perspective; it's specifically the in-app visibility that's gone. Not fixing this unprompted since it was an explicit "remove this" — flagging it here so it's a known, deliberate tradeoff rather than a silently reintroduced compliance gap.
