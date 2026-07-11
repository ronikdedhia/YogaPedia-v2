// Static curated phrases spoken during a Meditation Zone session — same shape/spirit as
// PoseCheck.jsx's FIXED_PHRASES table, just a bigger set for variety over a longer session.
// Kept to the two languages the backend's pose-check chain supports (chains/checkPose.js's
// SUPPORTED_LANGUAGES), not a general-purpose i18n table.
export const MOTIVATIONAL_PHRASES = {
  en: [
    'Breathe in slowly, and let go of anything you\'re holding onto.',
    'You are exactly where you need to be right now.',
    'Let your shoulders soften, and let your mind settle.',
    'Every breath is a fresh start.',
    'There is nothing to fix in this moment — just be here.',
    'Notice the quiet. It has been waiting for you.',
    'You are allowed to rest.',
    'Let each exhale carry a little more tension away.',
    'Stillness is not empty — it is full of you.',
    'This moment of peace is yours, and no one can take it.',
    'Trust the pace of your own breath.',
    'You don\'t have to do anything right now, except be.',
    'Let your thoughts pass by like clouds, without holding on.',
    'Calm is always available to you — you\'re finding it now.',
    'You showed up for yourself today. That matters.',
  ],
  hi: [
    'धीरे-धीरे सांस लें, और जो कुछ भी पकड़े हुए हैं उसे छोड़ दें।',
    'आप अभी ठीक वहीं हैं जहां आपको होना चाहिए।',
    'अपने कंधों को ढीला छोड़ें, और अपने मन को शांत होने दें।',
    'हर सांस एक नई शुरुआत है।',
    'इस पल में कुछ भी ठीक करने की जरूरत नहीं है — बस यहां रहें।',
    'शांति को महसूस करें। यह आपका इंतजार कर रही थी।',
    'आपको आराम करने की अनुमति है।',
    'हर सांस छोड़ने के साथ थोड़ा और तनाव दूर होने दें।',
    'यह शांति का पल आपका है, और कोई इसे छीन नहीं सकता।',
    'अपनी सांस की गति पर भरोसा करें।',
    'आज आप अपने लिए यहां आए — यह मायने रखता है।',
  ],
};

export function getRandomMotivationalPhrase(language = 'en') {
  const phrases = MOTIVATIONAL_PHRASES[language] || MOTIVATIONAL_PHRASES.en;
  return phrases[Math.floor(Math.random() * phrases.length)];
}
