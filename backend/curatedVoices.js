// A small, deliberately short menu (per explicit request: "only a few options"), picked
// from the real live voice list on this account (GET /v2/voices, verified once the API
// key's `voices_read` permission was added — see ARCHITECTURE.md §16.1/§18.5) rather than
// guessed. Chosen for fitting a calm live-instructor tone, not the full catalog (skipped
// e.g. "Fierce Warrior"/"Social Media Creator" as tonally wrong for pose correction).
module.exports = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George — warm, storyteller (default)' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah — mature, reassuring' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', label: 'Roger — laid-back, casual' },
  { id: 'hpp4J3VqNfWAUOO0d1Us', label: 'Bella — professional, bright' },
];
