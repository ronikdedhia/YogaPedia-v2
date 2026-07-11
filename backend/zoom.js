// Zoom Server-to-Server OAuth — same "plain fetch, no SDK" convention as ElevenLabs/Brevo
// elsewhere in this backend. Missing keys means the feature stays disabled, nothing crashes
// (see auth.js/db.js/email.js for the same hasXKey pattern).
const hasZoomKeys = Boolean(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);

let cachedToken = null;
let cachedTokenExpiresAt = 0;

// Server-to-Server OAuth tokens last ~1hr — cached in module state and refetched only once
// expired, rather than once per meeting created.
async function getZoomAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;

  const basicAuth = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    { method: 'POST', headers: { Authorization: `Basic ${basicAuth}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zoom OAuth token request failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  // Refresh a minute early rather than cutting it exactly at expiry.
  cachedTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function createZoomMeeting({ topic, startTime, durationMinutes }) {
  const token = await getZoomAccessToken();
  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      topic,
      type: 2, // scheduled meeting
      start_time: startTime,
      duration: durationMinutes,
      settings: { join_before_host: true, waiting_room: false },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('Zoom meeting creation failed:', res.status, body);
    throw new Error('Zoom meeting creation failed.');
  }
  const data = await res.json();
  return { joinUrl: data.join_url, meetingId: data.id, startUrl: data.start_url };
}

module.exports = { hasZoomKeys, createZoomMeeting };
