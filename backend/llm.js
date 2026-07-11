const { ChatGroq } = require('@langchain/groq');

const hasApiKey = Boolean(process.env.GROQ_API_KEY);

// Placeholder key so the client doesn't throw at boot without one — every call site
// guards on hasApiKey first and never actually reaches the network without a real key.
const apiKey = process.env.GROQ_API_KEY || 'unset';

const visionModel = new ChatGroq({
  apiKey,
  model: 'meta-llama/llama-4-scout-17b-16e-instruct',
  temperature: 0.2,
  maxTokens: 300,
});

const textModel = new ChatGroq({
  apiKey,
  model: 'llama-3.3-70b-versatile',
  temperature: 0.4,
  maxTokens: 1200,
});

module.exports = { hasApiKey, visionModel, textModel };
