const openai = require("../openai");

export async function generateCustomSessionTitle(content) {
  const prompt = `Summarize this user message in 3–6 words for a chat title:\n"${content}"`;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 15,
    });
    return response.choices?.[0]?.message?.content?.trim() || 'New Chat';
  } catch (err) {
    console.warn('Title generation failed:', err.message);
    return 'New Chat';
  }
}
