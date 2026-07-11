import { BRAND_LINKS } from './brandLinks.js';
import { MOTIVATIONAL_VIDEOS } from './motivationalVideos.js';

export default function DiscoverView() {
  const categories = [...new Set(BRAND_LINKS.map((l) => l.category))];

  return (
    <div className="yoga-plan">
      <h2 style={{ marginTop: 0 }}>Discover</h2>

      <h3>Shop</h3>
      {categories.map((category) => (
        <div key={category} style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ marginBottom: '0.5rem' }}>{category}</h4>
          <div className="library-grid">
            {BRAND_LINKS.filter((l) => l.category === category).map((link, i) => (
              <a
                key={`${link.category}-${i}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="library-card"
                style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
              >
                <h3 style={{ margin: '0 0 0.3rem' }}>{link.name}</h3>
                <p className="yoga-plan__step-why">{link.note}</p>
                <p className="pose-check__gif-note" style={{ color: 'var(--muted)' }}>View on {link.url.includes('flipkart') ? 'Flipkart' : 'Amazon'} →</p>
              </a>
            ))}
          </div>
        </div>
      ))}

      <h3>Watch</h3>
      <div className="library-grid">
        {MOTIVATIONAL_VIDEOS.map((video) => (
          <div key={video.youtubeId} className="library-card">
            <div style={{ aspectRatio: '16 / 9' }}>
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${video.youtubeId}`}
                title={video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ border: 'none' }}
              />
            </div>
            <h3 style={{ margin: '0.6rem 0 0.3rem' }}>{video.title}</h3>
            <p className="yoga-plan__step-why">{video.channel}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
