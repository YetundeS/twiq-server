const starterModels = ["LinkedIn Personal", "Headlines", "Storyteller"].map(m => m.toLowerCase());
const proModels = ["LinkedIn Your Business", "Caption", "Video Scripts", "Carousel"].map(m => m.toLowerCase());

function hasAccess(plan, modelName) {
  if (!plan || !modelName) return false;

  const normalizedPlan = plan.toLowerCase();
  const normalizedModel = modelName.toLowerCase().trim();

  if (normalizedPlan === "none") return false;
  if (normalizedPlan === "starter") return starterModels.includes(normalizedModel);
  if (normalizedPlan === "pro") return starterModels.includes(normalizedModel) || proModels.includes(normalizedModel);
  if (normalizedPlan === "enterprise") return true;

  return false;
}


module.exports = { hasAccess };