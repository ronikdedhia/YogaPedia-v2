// Benefit descriptions for exactly the 12 poses in asanas.js — the ones we have a
// verified demo image and a tested vision-check prompt for. Recommendations are
// restricted to this list for now (not the wider 289-asana merged_df.csv corpus in
// asanaBenefits.json/retrieval.js) so every recommended pose also has a working
// pose-check + demo image. Checked against asanaBenefits.json first: only 4 of these
// 12 names had a clean match there, and a few of those matches were flat wrong (e.g.
// substring-matched "Virabhadrasana II" to the unrelated "Bhadrasana") — so these are
// written fresh instead of reusing that corpus.
module.exports = [
  {
    asana: 'Anantasana',
    benefits: 'Stretches the hamstrings and hips, builds balance and core control lying on one side, and eases tightness in the legs and lower back.',
  },
  {
    asana: 'Baddha Konasana',
    benefits: 'Opens the hips and groin, improves flexibility in the inner thighs, supports circulation in the pelvic region, and is calming for the nervous system.',
  },
  {
    asana: 'Bird Dog Pose',
    benefits: 'Builds core stability and balance, strengthens the lower back and glutes, and helps improve posture and spinal support.',
  },
  {
    asana: 'Padmasana (Lotus Pose)',
    benefits: 'Deeply opens the hips and knees, gives a stable, upright base for seated meditation, and encourages steady, calm breathing.',
  },
  {
    asana: 'Matsyendrasana',
    benefits: 'A seated spinal twist that increases spinal flexibility, stimulates digestion, and relieves stiffness through the back.',
  },
  {
    asana: 'Natarajasana',
    benefits: 'A standing balance and backbend that strengthens the legs, opens the chest and shoulders, and improves overall flexibility and focus.',
  },
  {
    asana: 'Side Plank Pose (Vasisthasana)',
    benefits: 'Builds arm, shoulder, wrist and core strength, and improves balance and body-line stability.',
  },
  {
    asana: 'Tadasana',
    benefits: 'The foundational standing posture — improves posture and body awareness, grounds the body, and prepares it for other standing poses.',
  },
  {
    asana: 'Tree Pose (Vrikshasana)',
    benefits: 'Improves balance and focus, strengthens the legs and ankles, and opens the hips.',
  },
  {
    asana: 'Trikonasana',
    benefits: 'Stretches the legs, hips, spine and chest, improves lateral flexibility and stability, and can ease mild back stiffness.',
  },
  {
    asana: 'Vakrasana',
    benefits: 'A simpler seated spinal twist that gently mobilizes the spine, aids digestion, and relieves lower-back tightness — a good entry point before deeper twists.',
  },
  {
    asana: 'Virabhadrasana II',
    benefits: 'Builds leg and core strength and stamina, opens the hips and chest, and improves focus and stability.',
  },
];
