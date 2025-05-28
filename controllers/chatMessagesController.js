const supabase = require('../config/supabaseClient');
const { COACH_ASSISTANTS } = require('../constants');
const openai = require('../openai');
const { generateCustomSessionTitle } = require('../services/chatMessageService');

exports.sendMessage = async (req, res) => {
  const { session_id, content, assistantSlug } = req.body;
  const user_id = req.user.id;

  if (!content || !content.trim() || !assistantSlug) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  let chatSessionId = session_id;
  let threadId;
  let chatSession;

  // Generate a title based on first user message
  let generatedTitle = 'New Chat';

  try {
    // Create session + thread if needed
    if (!chatSessionId) {
      // generate custom chat session title for new chats
      try {
        const customTitle = await generateCustomSessionTitle(content);
        if (customTitle) generatedTitle = customTitle;
      } catch (titleGenError) {
        console.warn('Title generation failed, using fallback:', titleGenError.message);
      }


      // create session + thread
      const thread = await openai.beta.threads.create();
      threadId = thread.id;

      const { data: newSession, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert([
          {
            user_id,
            assistant_slug: assistantSlug,
            thread_id: threadId,
            title: generatedTitle,
          },
        ])
        .select()
        .single();

      if (sessionError) throw sessionError;
      chatSessionId = newSession.id;
      chatSession = newSession
    } else {
      const { data: sessionData, error: fetchError } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('id', chatSessionId)
        .single();

      if (fetchError) throw fetchError;
      threadId = sessionData.thread_id;
      chatSession = sessionData
    }

    // Save user message
    await supabase.from('chat_messages').insert([
      {
        session_id: chatSessionId,
        sender: 'user',
        content: content,
      },
    ]);

    // Add message to OpenAI thread
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: content,
    });

    const assistantId = COACH_ASSISTANTS[assistantSlug];

    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
      stream: true,
    });

    // Setup SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send keep-alive pings every 5 seconds to keep connection open during OpenAI delay
    const pingInterval = setInterval(() => {
      res.write(': ping\n\n');
    }, 5000);


    let fullAssistantReply = '';
    let clientDisconnected = false;
    let assistantStarted = false;

    req.on('close', () => {
      clientDisconnected = true;
    });

    // Send session ID once
    res.write(`data: ${JSON.stringify({ type: 'SESSION', chatSession: chatSession })}\n\n`);

    for await (const event of run) {
      if (clientDisconnected) break;

      if (event.event === 'thread.message.delta') {
        const delta = event.data.delta?.content?.[0]?.text?.value;
        if (delta) {

          if (!assistantStarted) {
            assistantStarted = true;
            clearInterval(pingInterval); // ✅ Stop pinging once real data starts
          }
          fullAssistantReply += delta;
          res.write(`data: ${JSON.stringify({ type: 'SUCCESS', message: delta })}\n\n`);
        }
      }

      if (event.event === 'thread.run.completed') {
        await supabase.from('chat_messages').insert([
          {
            session_id: chatSessionId,
            sender: 'assistant',
            content: fullAssistantReply,
            status: 'complete',
          },
        ]);

        res.write(`data: ${JSON.stringify({ type: 'END' })}\n\n`);
        res.end();
        return;
      }
    }

    // 🔹 Handle disconnection AFTER the loop
    if (clientDisconnected && fullAssistantReply.trim()) {
      console.log('Client disconnected, saving partial reply...');

      await supabase.from('chat_messages').insert([
        {
          session_id: chatSessionId,
          sender: 'assistant',
          content: fullAssistantReply,
          status: clientDisconnected ? 'incomplete' : 'complete',
        },
      ]);
    }
  } catch (err) {
    // console.error('Error during stream:', err);
    if (!res.headersSent) {
      res.status(500); // Set 500 status code
      res.write(`data: ${JSON.stringify({ type: 'ERROR', message: err.message })}\n\n`);
      res.end();
    }
  }
};
