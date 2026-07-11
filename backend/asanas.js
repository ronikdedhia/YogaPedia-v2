// Real pose classes the old Keras model was trained on (home/labels.npy in the v1 repo,
// verified by loading the file directly — the README's "26 asanas" claim was wrong, the
// actual trained model only covered 14 raw labels).
//
// Merged two duplicate pairs found in the raw label data (confirmed with user):
// - 'Lotus' and 'padmasana' were two separate classes for the literal same pose.
// - 'tree pose' and 'tree pose 1' looked like duplicate training sessions for Vrikshasana.
// Result: 12 distinct asanas below.
module.exports = [
  'Anantasana',
  'Baddha Konasana',
  'Bird Dog Pose',
  'Padmasana (Lotus Pose)',
  'Matsyendrasana',
  'Natarajasana',
  'Side Plank Pose (Vasisthasana)',
  'Tadasana',
  'Tree Pose (Vrikshasana)',
  'Trikonasana',
  'Vakrasana',
  'Virabhadrasana II',
];
