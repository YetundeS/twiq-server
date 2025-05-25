
const COACH_ASSISTANTS = {
  carousel: 'asst_abc123',
  storyteller: 'asst_def456',
  headlines: 'asst_xyz789',
  linkedin: 'asst_qwe321',
  video_scripts: 'asst_klo763',
  linkedin_business: 'asst_lmn987',
  captions: 'asst_uvw654',
};

function getAssistantId(slug) {
  return COACH_ASSISTANTS[slug];
}

module.exports = {
  COACH_ASSISTANTS,
  getAssistantId,
};
