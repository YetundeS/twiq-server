
const COACH_ASSISTANTS = {
  carousel: 'asst_v8lwEKfUhwbCjj31zW3QWJL9',
  storyteller: 'asst_25Mfs5oHUVkcp8EoCSTabyRg',
  headlines: 'asst_BVvyVt5stKSny9Om81wBomvU',
  linkedin_business: 'asst_gs5POc8Srqq9NfcR3fLZhlNF',
  linkedin_personal: 'asst_XI2ZT74RmmE43N7Wm5leP1yL',
  captions: 'asst_D6JhKrMPH46WPdzA0hmzI3LY',
  video_scripts: 'asst_RcxmUQDIacMEO0BzABwb6tsa',
};

function getAssistantId(slug) {
  return COACH_ASSISTANTS[slug];
}

module.exports = {
  COACH_ASSISTANTS,
  getAssistantId,
};
