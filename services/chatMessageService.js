const openai = require("../openai");
const { encoding_for_model } = require('@dqbd/tiktoken');
const encoding = encoding_for_model('gpt-4'); // or your actual model

async function generateCustomSessionTitle(content) {
  const prompt = `Summarize this user message in 4 words max for a chat title:\n"${content}"`;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 15,
    });

    let title = response.choices?.[0]?.message?.content?.trim() || 'New Chat';

    // remove surrounding quotes if present (single or double)
    title = title.replace(/^["']|["']$/g, '');

    return title;
  } catch (err) {
    // console.warn('Title generation failed:', err.message);
    return 'New Chat';
  }
}


async function checkIfEnoughQuota(user, inputContent = '', estimatedOutputTokens = 1000) {
  const quota = user.subscription_quota;
  const usage = user.subscription_usage || {
    input_tokens_used: 0,
    output_tokens_used: 0,
    cached_input_tokens_used: 0,
  };

  const inputTokens = encoding.encode(inputContent).length;
  const outputTokens = estimatedOutputTokens; // You can refine this based on assistant model

  const estimated = {
    input: inputTokens,
    output: outputTokens,
    cached: 0,
  };

  if (
    usage.input_tokens_used + estimated.input > quota.input_tokens ||
    usage.output_tokens_used + estimated.output > quota.output_tokens ||
    usage.cached_input_tokens_used + estimated.cached > quota.cached_input_tokens
  ) {
    return { error: 'Quota exceeded' };
  }

  return { ok: true };
}


module.exports = { generateCustomSessionTitle, checkIfEnoughQuota };