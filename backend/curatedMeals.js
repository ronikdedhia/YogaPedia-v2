// Curated meal suggestions — same reasoning as curatedAsanas.js/curatedPranayama.js: a
// small fixed list the schedule-drafting LLM must choose from verbatim, not free-text
// "diet tips" it invents fresh each time. Written to be actual meals (ingredients + why),
// not one-line advice like "eat more protein". `dietTags` gates suitability (vegetarian/
// vegan/non-veg/general), `goalTags` match the same tags OnboardingForm.jsx already
// collects (flexibility, stress relief, better sleep, weight management, back/joint
// health, general fitness) so the LLM can pick relevantly rather than randomly.
module.exports = [
  {
    meal: 'Overnight oats with chia seeds, banana, and mixed berries',
    type: 'breakfast',
    dietTags: ['vegetarian', 'vegan', 'general'],
    goalTags: ['weight management', 'general fitness'],
    why: 'Slow-release carbs and chia-seed omega-3s give steady energy through a morning practice without a sugar crash.',
  },
  {
    meal: 'Greek yogurt with walnuts, flaxseed, and honey',
    type: 'breakfast',
    dietTags: ['vegetarian', 'general'],
    goalTags: ['back/joint health', 'general fitness'],
    why: 'Protein and omega-3s support joint and muscle recovery after asana practice.',
  },
  {
    meal: 'Moong dal cheela (savory lentil pancake) with mint chutney',
    type: 'breakfast',
    dietTags: ['vegetarian', 'vegan'],
    goalTags: ['weight management', 'general fitness'],
    why: 'High-protein, light, and easy to digest — a traditional pre-practice breakfast that won\'t sit heavy.',
  },
  {
    meal: 'Grilled paneer or tofu with sautéed spinach and quinoa',
    type: 'lunch',
    dietTags: ['vegetarian', 'vegan', 'general'],
    goalTags: ['back/joint health', 'general fitness'],
    why: 'Iron from spinach plus complete-protein quinoa supports muscle repair and sustained energy.',
  },
  {
    meal: 'Grilled chicken or fish with roasted vegetables and brown rice',
    type: 'lunch',
    dietTags: ['non-veg', 'general'],
    goalTags: ['weight management', 'general fitness'],
    why: 'Lean protein and fiber keep you full without the heaviness that makes seated/twisting poses uncomfortable afterward.',
  },
  {
    meal: 'Rajma (kidney bean curry) with brown rice and cucumber salad',
    type: 'lunch',
    dietTags: ['vegetarian', 'vegan'],
    goalTags: ['weight management', 'general fitness', 'back/joint health'],
    why: 'Plant protein and fiber support digestion and steady energy through an afternoon practice.',
  },
  {
    meal: 'Warm vegetable soup with whole-grain toast',
    type: 'dinner',
    dietTags: ['vegetarian', 'vegan', 'general'],
    goalTags: ['better sleep', 'stress relief'],
    why: 'Light and warm rather than heavy — easier on digestion before winding down, supporting better sleep.',
  },
  {
    meal: 'Baked salmon or grilled tofu with steamed greens',
    type: 'dinner',
    dietTags: ['non-veg', 'vegetarian', 'vegan', 'general'],
    goalTags: ['back/joint health', 'stress relief'],
    why: 'Omega-3s (salmon) or magnesium-rich greens (either version) are linked to lower inflammation and calmer sleep.',
  },
  {
    meal: 'Khichdi (rice and lentil porridge) with ghee and turmeric',
    type: 'dinner',
    dietTags: ['vegetarian', 'general'],
    goalTags: ['stress relief', 'better sleep', 'back/joint health'],
    why: 'A traditional easy-to-digest meal; turmeric\'s anti-inflammatory properties are often paired with joint-focused practice.',
  },
  {
    meal: 'Sliced apple with almond butter',
    type: 'snack',
    dietTags: ['vegetarian', 'vegan', 'general'],
    goalTags: ['weight management', 'general fitness'],
    why: 'Fiber plus healthy fats curb hunger between meals without the energy dip of a sugary snack.',
  },
  {
    meal: 'Handful of soaked almonds and walnuts',
    type: 'snack',
    dietTags: ['vegetarian', 'vegan', 'general'],
    goalTags: ['back/joint health', 'general fitness'],
    why: 'A traditional easy-to-digest source of healthy fats and protein between meals.',
  },
  {
    meal: 'Herbal chamomile or tulsi tea',
    type: 'snack',
    dietTags: ['vegetarian', 'vegan', 'general'],
    goalTags: ['stress relief', 'better sleep'],
    why: 'Caffeine-free and calming — a good evening pairing with pranayama or wind-down poses.',
  },
  {
    meal: 'Cucumber and mint infused water',
    type: 'snack',
    dietTags: ['vegetarian', 'vegan', 'general'],
    goalTags: ['weight management', 'general fitness', 'flexibility'],
    why: 'An easy way to help hit a daily water target without plain water feeling like a chore.',
  },
];
