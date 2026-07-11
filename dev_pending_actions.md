# Dev pending actions — things only you can do

## Still pending

1. **Confirm the practice reminder actually fires:** Settings → enable "Remind me to practice," pick a time a minute or two away, keep the tab open, grant the notification permission prompt if asked.
2. **Confirm "Export as text" works:** Plan tab → "Export as text" → check a real `.txt` file downloads with your actual plan in it.
3. **Try the new voice picker:** Settings → pick a voice other than the default, then trigger a spoken correction (Today → Practice now) and confirm it's actually using that voice.
4. **Try Hindi spoken guidance:** Settings → change "Spoken guidance language" to Hindi, then trigger a correction and confirm it's actually spoken in Hindi (verified server-side that the text comes back correctly translated and ElevenLabs returns valid audio for it — haven't heard it out loud yet). If using browser voice instead of ElevenLabs, this also depends on your OS having a Hindi voice installed — if it sounds off, that's a device/browser voice-availability limitation, not a bug in the app.
5. **Check your inbox:** two real test weekly-summary emails were already sent to you while verifying the Brevo integration (subject "Your week on YogaPedia") — check they actually arrived and look right in a real email client (spacing/formatting was only checked as raw HTML, not rendered). The automatic weekly send is live now too (checks every 5 min for your configured `WEEKLY_SUMMARY_SEND_TIME`) — you don't need to do anything for that to keep working, just know it's running.

## Not urgent / later

- [ ] Decide hosting for frontend (Vercel/Netlify/GitHub Pages) and backend (serverless function vs. always-on Node process) when ready to deploy.
- [ ] Clean up: `backend/.env` still has unused `MONGO_DB_USER`/`MONGO_DB_PASSWORD` fields left over from setup — harmless (nothing reads them, real credentials are embedded in `MONGODB_URI`), safe to delete whenever.
- [ ] Clerk's "Sign up" link still navigates away to Clerk's generic hosted page (unbranded) since there's no dedicated in-app `<SignUp/>` route — cosmetic only (Google-OAuth-only means "Continue with Google" already handles both new and returning users), worth a look only if full brand consistency matters later.
