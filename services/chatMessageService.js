const openai = require("../openai");

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

module.exports = { generateCustomSessionTitle };