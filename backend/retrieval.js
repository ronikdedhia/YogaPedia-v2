// Lightweight keyword-overlap retrieval over the 289-asana benefits corpus
// (converted from the old repo's merged_df.csv, deduped by name — see asanaBenefits.json).
// No embeddings/ML model needed: at ~290 short documents, plain word-overlap scoring is
// enough to shortlist relevant candidates before handing them to the LLM. This keeps the
// prompt small (Groq free tier has a real per-minute token cap — sending all 289 asanas'
// benefit text on every request would blow past it).

const ASANA_BENEFITS = require('./asanaBenefits.json');

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'it', 'this', 'that', 'for',
  'with', 'on', 'as', 'are', 'be', 'by', 'i', 'my', 'me', 'have', 'has', 'had', 'was',
  'were', 'will', 'can', 'not', 'no', 'do', 'does', 'from', 'at', 'also', 'very', 'get',
]);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

const CORPUS = ASANA_BENEFITS.map((entry) => ({
  ...entry,
  tokens: new Set(tokenize(entry.benefits + ' ' + entry.asana)),
}));

function getTopMatches(queryText, topN = 15) {
  const queryTokens = tokenize(queryText);
  if (queryTokens.length === 0) {
    // No usable signal in the input — fall back to a fixed, varied slice rather than
    // an arbitrary/empty result.
    return CORPUS.slice(0, topN).map(({ asana, benefits }) => ({ asana, benefits }));
  }

  const scored = CORPUS.map((doc) => {
    let score = 0;
    for (const token of queryTokens) {
      if (doc.tokens.has(token)) score += 1;
    }
    return { asana: doc.asana, benefits: doc.benefits, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map(({ asana, benefits }) => ({ asana, benefits }));
}

module.exports = { getTopMatches };
