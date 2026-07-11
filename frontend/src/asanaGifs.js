// Demo images for all 12 pose-check labels, sourced from Wikimedia Commons under
// Creative Commons licenses — see public/images/ATTRIBUTIONS.md for full attribution
// (required by the licenses) and source links. Every image was visually checked
// against the actual pose before inclusion; several initial candidates were rejected
// after inspection for showing the wrong pose/variant (see ATTRIBUTIONS.md notes).
const ASANA_IMAGES = {
  Anantasana: { src: '/images/anantasana.jpg' },
  'Baddha Konasana': { src: '/images/baddha-konasana.jpg' },
  'Bird Dog Pose': { src: '/images/bird-dog-pose.jpg' },
  'Padmasana (Lotus Pose)': { src: '/images/padmasana.jpg' },
  Matsyendrasana: { src: '/images/matsyendrasana.jpg' },
  Natarajasana: {
    src: '/images/natarajasana.jpg',
    note: 'Shown here in an advanced/deep expression — most practitioners hold a shallower version.',
  },
  'Side Plank Pose (Vasisthasana)': { src: '/images/side-plank.jpg' },
  Tadasana: { src: '/images/tadasana.jpg' },
  'Tree Pose (Vrikshasana)': { src: '/images/tree-pose.jpg' },
  Trikonasana: { src: '/images/trikonasana.jpg' },
  Vakrasana: {
    src: '/images/vakrasana.jpg',
    note: 'No plain photo of this exact pose was available — this is a stylized rendering, not a photo.',
  },
  'Virabhadrasana II': { src: '/images/virabhadrasana-ii.jpg' },
};

export function getAsanaGif(name) {
  return ASANA_IMAGES[name] ?? null;
}
