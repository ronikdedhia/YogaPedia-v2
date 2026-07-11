import { useEffect, useState, useCallback } from 'react';
import { ClerkProvider, SignedIn, SignedOut, SignIn, UserButton, useAuth, useClerk } from '@clerk/clerk-react';
import OnboardingForm from './OnboardingForm.jsx';
import TodayView from './TodayView.jsx';
import PlanView from './PlanView.jsx';
import ActivityView from './ActivityView.jsx';
import QuickRecommendView from './QuickRecommendView.jsx';
import LibraryView from './LibraryView.jsx';
import SettingsView from './SettingsView.jsx';
import MeditationZoneView from './MeditationZoneView.jsx';
import DiscoverView from './DiscoverView.jsx';
import CommunitiesView from './CommunitiesView.jsx';
import { usePracticeReminder } from './usePracticeReminder.js';
import { makeAuthFetch } from './api.js';
import './App.css';

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'plan', label: 'Plan' },
  { key: 'activity', label: 'Activity' },
  { key: 'recommend', label: 'Quick Recommend' },
  { key: 'library', label: 'Library' },
  { key: 'communities', label: 'Communities' },
  { key: 'meditation', label: 'Meditation' },
  { key: 'discover', label: 'Discover' },
  { key: 'settings', label: 'Settings' },
];

// No Clerk configured — fails CLOSED (blocks the app entirely) rather than falling back to
// an open, no-login experience. A misconfigured/missing key must never mean "everyone gets
// in without signing in."
function AuthNotConfigured() {
  return (
    <main className="app">
      <h1>YogaPedia</h1>
      <p className="app__subtitle">
        Sign-in isn't configured for this deployment — set <code>VITE_CLERK_PUBLISHABLE_KEY</code> (frontend) and{' '}
        <code>CLERK_SECRET_KEY</code> (backend) to enable access.
      </p>
    </main>
  );
}

function Navbar({ tab, setTab }) {
  const { signOut } = useClerk();
  return (
    <nav className="app-navbar">
      <div className="app-navbar__inner">
        <span className="app-navbar__brand">YogaPedia</span>
        <div className="app-navbar__links">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`pose-check__btn ${tab === t.key ? 'is-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="app-navbar__right">
          <UserButton afterSignOutUrl="/" />
          <button type="button" className="pose-check__btn" onClick={() => signOut()}>
            Log out
          </button>
        </div>
      </div>
    </nav>
  );
}

function AuthedApp() {
  const { getToken } = useAuth();
  const [hasSchedule, setHasSchedule] = useState(null); // null = loading
  const [tab, setTab] = useState('today');
  usePracticeReminder(); // runs regardless of which tab is active

  const checkSchedule = useCallback(async () => {
    try {
      const authFetch = makeAuthFetch(getToken);
      const res = await authFetch('/api/schedule/today');
      setHasSchedule(res.status !== 404);
    } catch (err) {
      console.error('Failed to check for an existing schedule:', err);
      setHasSchedule(false);
    }
  }, [getToken]);

  useEffect(() => {
    checkSchedule();
  }, [checkSchedule]);

  if (hasSchedule === null) {
    return (
      <main className="app">
        <p>Loading…</p>
      </main>
    );
  }

  if (!hasSchedule) {
    return (
      <main className="app">
        <OnboardingForm onDone={checkSchedule} />
      </main>
    );
  }

  return (
    <>
      <Navbar tab={tab} setTab={setTab} />
      <main className="app">
        {tab === 'today' && <TodayView />}
        {tab === 'plan' && <PlanView />}
        {tab === 'activity' && <ActivityView />}
        {tab === 'recommend' && <QuickRecommendView />}
        {tab === 'library' && <LibraryView />}
        {tab === 'communities' && <CommunitiesView />}
        {tab === 'meditation' && <MeditationZoneView />}
        {tab === 'discover' && <DiscoverView />}
        {tab === 'settings' && <SettingsView />}
      </main>
    </>
  );
}

export default function App() {
  if (!CLERK_KEY) return <AuthNotConfigured />;

  return (
    <ClerkProvider publishableKey={CLERK_KEY}>
      <SignedOut>
        <main className="app">
          <h1>YogaPedia</h1>
          <SignIn />
        </main>
      </SignedOut>
      <SignedIn>
        <AuthedApp />
      </SignedIn>
    </ClerkProvider>
  );
}
