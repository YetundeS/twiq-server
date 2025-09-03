
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

const PLAN_QUOTAS = {
  STARTER: {
    input_tokens: 498000,
    cached_tokens: 199000,
    output_tokens: 99000,
  },
  PRO: {
    input_tokens: 998000,
    cached_tokens: 399000,
    output_tokens: 199000,
  },
  ENTERPRISE: {
    input_tokens: 3749000,
    cached_tokens: 1499000,
    output_tokens: 749000,
  },
};


const PLAN_ID_MAP = {
  prod_SLfSE6oRt80Mu7: 'STARTER',

  // prod_STjJjYZO8hG8dK: 'PRO', // test
  prod_SLfTLYmEto0mP5: 'PRO',


  // prod_STipHjB6zmvkGa: 'ENTERPRISE',  // test
  prod_SLfX1eCT161Yxe: 'ENTERPRISE',
};

const ASSISTANT_MODEL_NAMES = {
  carousel: "Carousel",
  storyteller: "Storyteller",
  headlines: "Headlines",
  linkedin_business: "LinkedIn Your Business",
  linkedin_personal: "LinkedIn Personal",
  captions: "Caption",
  video_scripts: "Video Scripts",
};

// Plan hierarchy for upgrade/downgrade detection
const PLAN_HIERARCHY = {
  STARTER: 1,
  PRO: 2,
  ENTERPRISE: 3,
};

// Helper function to determine if plan change is upgrade or downgrade
function isUpgrade(fromPlan, toPlan) {
  if (!fromPlan || !toPlan) return false;
  return PLAN_HIERARCHY[toPlan] > PLAN_HIERARCHY[fromPlan];
}

function isDowngrade(fromPlan, toPlan) {
  if (!fromPlan || !toPlan) return false;
  return PLAN_HIERARCHY[toPlan] < PLAN_HIERARCHY[fromPlan];
}



module.exports = {
  COACH_ASSISTANTS,
  getAssistantId,
  PLAN_QUOTAS,
  PLAN_ID_MAP,
  ASSISTANT_MODEL_NAMES,
  PLAN_HIERARCHY,
  isUpgrade,
  isDowngrade
};


