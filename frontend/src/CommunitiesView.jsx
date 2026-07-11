import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { makeAuthFetch } from './api.js';

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// Community detail: feed (refresh-based, no polling) + community-scoped Zoom sessions.
// Only rendered once the viewer is a confirmed member (CommunitiesView gates on isMember).
function CommunityDetail({ community, authFetch, onBack, onMembershipChanged }) {
  const [posts, setPosts] = useState(null);
  const [postsError, setPostsError] = useState(null);
  const [postText, setPostText] = useState('');
  const [posting, setPosting] = useState(false);

  const [sessions, setSessions] = useState(null);
  const [sessionsError, setSessionsError] = useState(null);
  const [showHostForm, setShowHostForm] = useState(false);
  const [title, setTitle] = useState('');
  const [focusArea, setFocusArea] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [capacity, setCapacity] = useState(10);
  const [hostError, setHostError] = useState(null);
  const [hosting, setHosting] = useState(false);

  const loadPosts = useCallback(async () => {
    try {
      const res = await authFetch(`/api/communities/${community._id}/posts`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load posts.');
      setPosts(data);
      setPostsError(null);
    } catch (err) {
      setPostsError(err.message);
    }
  }, [authFetch, community._id]);

  const loadSessions = useCallback(async () => {
    try {
      const res = await authFetch(`/api/communities/${community._id}/sessions`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load sessions.');
      setSessions(data);
      setSessionsError(null);
    } catch (err) {
      setSessionsError(err.message);
    }
  }, [authFetch, community._id]);

  useEffect(() => {
    loadPosts();
    loadSessions();
  }, [loadPosts, loadSessions]);

  async function submitPost(e) {
    e.preventDefault();
    if (!postText.trim()) return;
    setPosting(true);
    try {
      const res = await authFetch(`/api/communities/${community._id}/posts`, { method: 'POST', body: JSON.stringify({ text: postText }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not post message.');
      setPostText('');
      await loadPosts();
    } catch (err) {
      setPostsError(err.message);
    } finally {
      setPosting(false);
    }
  }

  async function submitHostForm(e) {
    e.preventDefault();
    if (!title.trim() || !scheduledAt) {
      setHostError('Title and date/time are required.');
      return;
    }
    setHosting(true);
    setHostError(null);
    try {
      const res = await authFetch(`/api/communities/${community._id}/sessions`, {
        method: 'POST',
        body: JSON.stringify({ title, focusArea, scheduledAt: new Date(scheduledAt).toISOString(), durationMinutes, capacity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create session.');
      setTitle('');
      setFocusArea('');
      setScheduledAt('');
      setShowHostForm(false);
      await loadSessions();
    } catch (err) {
      setHostError(err.message);
    } finally {
      setHosting(false);
    }
  }

  async function joinSession(sessionId) {
    try {
      const res = await authFetch(`/api/communities/${community._id}/sessions/${sessionId}/join`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not join session.');
      await loadSessions();
    } catch (err) {
      setSessionsError(err.message);
    }
  }

  async function leaveSession(sessionId) {
    try {
      await authFetch(`/api/communities/${community._id}/sessions/${sessionId}/leave`, { method: 'POST' });
      await loadSessions();
    } catch (err) {
      setSessionsError(err.message);
    }
  }

  async function leaveCommunity() {
    await authFetch(`/api/communities/${community._id}/leave`, { method: 'POST' });
    onMembershipChanged();
    onBack();
  }

  return (
    <div className="yoga-plan">
      <button type="button" className="pose-check__btn" onClick={onBack}>
        ← Back to communities
      </button>
      <h2 style={{ marginTop: '1rem' }}>{community.name}</h2>
      <p className="app__subtitle">{community.description}</p>
      <button type="button" className="pose-check__btn" onClick={leaveCommunity}>
        Leave community
      </button>

      <h3 style={{ marginTop: '2rem' }}>Sessions</h3>
      {sessionsError && <p className="pose-check__error">{sessionsError}</p>}
      {!sessions && !sessionsError && <p>Loading sessions…</p>}
      {sessions && sessions.length === 0 && <p className="app__subtitle">No upcoming sessions yet.</p>}
      {sessions?.map((s) => (
        <div key={s._id} className="wellness-card">
          <div className="wellness-card__item">
            <span className="wellness-card__info">
              <strong>{s.title}</strong> — {formatDateTime(s.scheduledAt)} ({s.durationMinutes} min)
              {s.focusArea && ` · ${s.focusArea}`}
              <br />
              <span style={{ color: 'var(--muted)' }}>
                {s.seatsLeft} seat{s.seatsLeft === 1 ? '' : 's'} left
                {s.isTeacher ? ' · you are hosting' : s.isAttendee ? ' · you joined' : ''}
              </span>
            </span>
            {!s.isTeacher && !s.isAttendee && s.seatsLeft > 0 && (
              <button type="button" className="wellness-card__toggle" onClick={() => joinSession(s._id)}>
                Join
              </button>
            )}
            {!s.isTeacher && s.isAttendee && (
              <button type="button" className="wellness-card__toggle is-done" onClick={() => leaveSession(s._id)}>
                Leave
              </button>
            )}
          </div>
          {s.joinUrl && (
            <a href={s.joinUrl} target="_blank" rel="noopener noreferrer" className="pose-check__gif-note">
              Join on Zoom →
            </a>
          )}
        </div>
      ))}

      {!showHostForm ? (
        <button type="button" className="pose-check__btn" style={{ marginTop: '1rem' }} onClick={() => setShowHostForm(true)}>
          + Host a session
        </button>
      ) : (
        <form onSubmit={submitHostForm} className="wellness-card" style={{ marginTop: '1rem' }}>
          {hostError && <p className="pose-check__error">{hostError}</p>}
          <label className="yoga-plan__label" htmlFor="session-title">Title</label>
          <input id="session-title" type="text" className="yoga-plan__textarea" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="yoga-plan__label" htmlFor="session-focus">Focus area (optional)</label>
          <input id="session-focus" type="text" className="yoga-plan__textarea" value={focusArea} onChange={(e) => setFocusArea(e.target.value)} />
          <label className="yoga-plan__label" htmlFor="session-time">Date &amp; time</label>
          <input id="session-time" type="datetime-local" className="yoga-plan__textarea" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          <label className="yoga-plan__label" htmlFor="session-duration">Duration (minutes)</label>
          <input id="session-duration" type="number" min={5} max={180} className="yoga-plan__textarea" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} />
          <label className="yoga-plan__label" htmlFor="session-capacity">Capacity</label>
          <input id="session-capacity" type="number" min={1} max={500} className="yoga-plan__textarea" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
          <div className="pose-check__controls" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="pose-check__btn" onClick={() => setShowHostForm(false)}>Cancel</button>
            <button type="submit" className="pose-check__btn is-active" disabled={hosting}>{hosting ? 'Creating…' : 'Create session'}</button>
          </div>
        </form>
      )}

      <h3 style={{ marginTop: '2rem' }}>Feed</h3>
      {postsError && <p className="pose-check__error">{postsError}</p>}
      <form onSubmit={submitPost} style={{ marginBottom: '1rem' }}>
        <textarea
          className="yoga-plan__textarea"
          rows={2}
          placeholder="Share something with this community…"
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
        />
        <div className="pose-check__controls" style={{ marginTop: '0.5rem' }}>
          <button type="button" className="pose-check__btn" onClick={loadPosts}>Refresh</button>
          <button type="submit" className="pose-check__btn is-active" disabled={posting}>{posting ? 'Posting…' : 'Post'}</button>
        </div>
      </form>
      {!posts && !postsError && <p>Loading feed…</p>}
      {posts?.length === 0 && <p className="app__subtitle">No messages yet — be the first to post.</p>}
      {posts?.map((p) => (
        <div key={p._id} className="library-card" style={{ marginBottom: '0.5rem' }}>
          <p className="yoga-plan__step-why" style={{ margin: 0 }}>{p.text}</p>
          <p className="pose-check__gif-note" style={{ color: 'var(--muted)', margin: '0.3rem 0 0' }}>{formatDateTime(p.createdAt)}</p>
        </div>
      ))}
    </div>
  );
}

export default function CommunitiesView() {
  const { getToken } = useAuth();
  const authFetch = makeAuthFetch(getToken);
  const [communities, setCommunities] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const loadCommunities = useCallback(async () => {
    try {
      const res = await authFetch(`/api/communities${search ? `?q=${encodeURIComponent(search)}` : ''}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load communities.');
      setCommunities(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [authFetch, search]);

  useEffect(() => {
    loadCommunities();
  }, [loadCommunities]);

  async function joinCommunity(id) {
    try {
      await authFetch(`/api/communities/${id}/join`, { method: 'POST' });
      await loadCommunities();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await authFetch('/api/communities', { method: 'POST', body: JSON.stringify({ name: newName, description: newDescription }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create community.');
      setNewName('');
      setNewDescription('');
      setShowCreateForm(false);
      await loadCommunities();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  if (selected) {
    return (
      <CommunityDetail
        community={selected}
        authFetch={authFetch}
        onBack={() => setSelected(null)}
        onMembershipChanged={loadCommunities}
      />
    );
  }

  return (
    <div className="yoga-plan">
      <h2 style={{ marginTop: 0 }}>Communities</h2>
      <p className="app__subtitle">Find a community, join it, and arrange group sessions with fellow members.</p>

      <input
        type="text"
        className="yoga-plan__textarea"
        placeholder="Search communities…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && <p className="pose-check__error">{error}</p>}
      {!communities && !error && <p>Loading communities…</p>}

      <div className="library-grid" style={{ marginTop: '1rem' }}>
        {communities?.map((c) => (
          <div key={c._id} className="library-card">
            <h3 style={{ margin: '0 0 0.3rem' }}>{c.name}</h3>
            <p className="yoga-plan__step-why">{c.description}</p>
            <p className="pose-check__gif-note" style={{ color: 'var(--muted)' }}>{c.memberCount} member{c.memberCount === 1 ? '' : 's'}</p>
            {c.isMember ? (
              <button type="button" className="pose-check__btn is-active" onClick={() => setSelected(c)}>
                Open
              </button>
            ) : (
              <button type="button" className="pose-check__btn" onClick={() => joinCommunity(c._id)}>
                Join
              </button>
            )}
          </div>
        ))}
      </div>

      {!showCreateForm ? (
        <button type="button" className="pose-check__btn" style={{ marginTop: '1.5rem' }} onClick={() => setShowCreateForm(true)}>
          + New community
        </button>
      ) : (
        <form onSubmit={submitCreate} className="wellness-card" style={{ marginTop: '1.5rem' }}>
          {createError && <p className="pose-check__error">{createError}</p>}
          <label className="yoga-plan__label" htmlFor="community-name">Name</label>
          <input id="community-name" type="text" className="yoga-plan__textarea" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <label className="yoga-plan__label" htmlFor="community-description">Description</label>
          <textarea id="community-description" className="yoga-plan__textarea" rows={2} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
          <div className="pose-check__controls" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="pose-check__btn" onClick={() => setShowCreateForm(false)}>Cancel</button>
            <button type="submit" className="pose-check__btn is-active" disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
