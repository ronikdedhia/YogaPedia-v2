import YogaPlan from './YogaPlan.jsx';

// Thin wrapper restoring access to the one-off recommender for signed-in users — YogaPlan.jsx
// itself was only ever reachable from OpenModeApp before this, meaning it silently became
// unreachable the moment Clerk was configured, even though /api/recommend still worked fine.
// Calls the same public, no-login-required /api/recommend endpoint either way.
export default function QuickRecommendView() {
  return (
    <div>
      <h2>Quick recommend</h2>
      <p className="app__subtitle">
        A one-off suggestion for something you're dealing with right now — doesn't touch or change your actual
        weekly plan (see the Plan tab for that).
      </p>
      <YogaPlan />
    </div>
  );
}
