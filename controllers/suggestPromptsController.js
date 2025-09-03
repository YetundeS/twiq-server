const { OpenAI } = require("openai");
const logger = require('../utils/logger');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function isInputLongEnough(text) {
  return text.trim().length >= 22 || text.trim().split(/\s+/).length >= 5;
}

function buildPrompt(input, modelName, modelDescription) {
  return `
You are a prompt suggestion assistant for an AI agent model called "${modelName}".

Model description:
${modelDescription}

User's partial input:
"${input}"

Generate exactly 4 creative and specific prompt suggestions that:
- Complete or expand the user's partial input
- Match the purpose, tone, and format expected from the "${modelName}" model
- Are written clearly and concisely

Return only a JSON array of 4 strings.
`;
}

exports.suggestPrompts = async (req, res) => {
  const input = (req.query.input || "").trim();
  const model = (req.query.model || "").trim();
  const modelDescription = (req.query.description || "").trim(); // changed from body to query param

  if (!input || !model || !modelDescription) {
    return res.status(400).json({
      error: "Missing 'input', 'model', or 'description' query parameter.",
    });
  }

  if (!isInputLongEnough(input)) {
    return res.status(400).json({
      error: "Input too short. Must be at least 22 characters or 5 words.",
    });
  }

  const prompt = buildPrompt(input, model, modelDescription);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4", // or "gpt-4o"
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const rawOutput = completion.choices[0]?.message?.content?.trim();

    let suggestions;
    try {
      suggestions = JSON.parse(rawOutput);
      if (!Array.isArray(suggestions) || suggestions.length !== 4) {
        throw new Error("Invalid format");
      }
    } catch (err) {
      return res
        .status(500)
        .json({ error: "Failed to parse GPT output", raw: rawOutput });
    }

    res.status(200).json({ suggestions });
  } catch (err) {
    logger.logSystemError('OpenAI error in prompt suggestions', err, { input, model, modelDescription });
    res.status(500).json({ error: "Failed to generate suggestions" });
  }
};
