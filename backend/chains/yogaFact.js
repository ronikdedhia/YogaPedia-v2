const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { textModel } = require('../llm');

const PROMPT = ChatPromptTemplate.fromTemplate(`You are a yoga instructor sharing a short daily tip with your students on a public channel.

Give one interesting, true yoga fact or benefit. Maximum 2 lines. No preamble, no markdown, no quotation marks, no emoji-heavy formatting — just the fact itself, ready to post as-is.`);

const chain = PROMPT.pipe(textModel);

async function draftYogaFact() {
  const result = await chain.invoke({});
  return result.content.trim();
}

module.exports = { draftYogaFact };
