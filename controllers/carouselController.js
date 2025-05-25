const { COACH_ASSISTANTS } = require('../constants');
const openai = require('../openai');

exports.streamAssistantResponse = async (req, res) => {
  const { message, threadId } = req.query;
  const assistantId = COACH_ASSISTANTS.carousel;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const thread = threadId
      ? { id: threadId }
      : await openai.beta.threads.create();

    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: message,
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId,
      stream: true,
    });

    for await (const event of run) {
      if (event.event === 'thread.message.delta') {
        const delta = event.data.delta?.content?.[0]?.text?.value;
        if (delta) {
          res.write(`data: ${delta}\n\n`);
        }
      }

      if (event.event === 'thread.run.completed') {
        res.write('event: done\ndata: done\n\n');
        res.end();
        break;
      }
    }
  } catch (err) {
    console.error(err);
    res.write('event: error\ndata: Error from assistant\n\n');
    res.end();
  }
};
