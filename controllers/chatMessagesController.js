const supabase = require('../config/supabaseClient');
const { COACH_ASSISTANTS } = require('../constants');
const openai = require('../openai');

// exports.createChatMessage = async (req, res) => {
//   const { session_id, sender, content } = req.body;

//   if (!session_id || !sender || !content) {
//     return res.status(400).json({ error: 'Missing required fields' });
//   }

//   try {
//     const { data, error } = await supabase
//       .from('chat_messages')
//       .insert([
//         {
//           session_id,
//           sender,
//           content,
//         },
//       ])
//       .select()
//       .single();

//     if (error) {
//       return res.status(500).json({ error: error.message });
//     }

//     res.status(201).json({ message: data });
//   } catch (err) {
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };



// exports.sendMessage = async (req, res) => {
//   const { session_id, content, assistantSlug } = req.body;
//   const user_id = req.user.id;

//   if (!session_id || !content || !assistantSlug) {
//     return res.status(400).json({ error: 'Missing required fields' });
//   }


//   let chatSessionId = session_id;
//   let threadId;

//   try {
//     // If session_id is missing, create a new chat session
//     if (!chatSessionId) {
//       // 1. First create a thread
//       const thread = await openai.beta.threads.create();
//       threadId = thread.id;

//       // 2. Then create a chat session
//       const { data: newSession, error: sessionError } = await supabase
//         .from('chat_sessions')
//         .insert([
//           {
//             user_id,
//             assistant_slug: assistantSlug,
//             thread_id: threadId,
//             title: 'New Chat'
//           },
//         ])
//         .select()
//         .single();

//       if (sessionError) throw sessionError;
//       chatSessionId = newSession.id;
//     }

//     // 3. Create user message in DB
//     await supabase.from('chat_messages').insert([
//       {
//         session_id: chatSessionId,
//         sender: 'user',
//         content: content,
//       },
//     ]);

//     // Use OpenAI API
//     const assistantId = COACH_ASSISTANTS[assistantSlug];

//     // 4. Send user message to AI assistant for streamed response
//     await openai.beta.threads.messages.create(threadId, {
//       role: 'user',
//       content: content,
//     });

//     const run = await openai.beta.threads.runs.create(threadId, {
//       assistant_id: assistantId,
//       stream: true,
//     });

//     res.setHeader('Content-Type', 'text/event-stream');
//     res.setHeader('Cache-Control', 'no-cache');
//     res.setHeader('Connection', 'keep-alive');
//     res.flushHeaders();
    
//     // 5. temporarily save the AI assistant response
//     let fullAssistantReply = '';

//     for await (const event of run) {
//       if (event.event === 'thread.message.delta') {
//         const delta = event.data.delta?.content?.[0]?.text?.value;
//         if (delta) {
//           fullAssistantReply += delta;
//           res.write(`data: ${delta}\n\n`);
//         }
//       }

//       if (event.event === 'thread.run.completed') {
//         // 6. Save the AI assistant response to DBc
//         await supabase.from('chat_messages').insert([
//           {
//             session_id: chatSessionId,
//             sender: 'assistant',
//             content: fullAssistantReply,
//           },
//         ]);
//         res.write(`event: session\ndata: ${chatSessionId}\n\n`);
//         res.write('event: done\ndata: done\n\n');
//         res.end();
//         break;
//       }
//     }
//   } catch (err) {
//     console.error(err);
//     res.write(`event: error\ndata: ${JSON.stringify(err.message)}\n\n`);
//     res.end();
//   }
// };


exports.sendMessage = async (req, res) => {
  const { session_id, content, assistantSlug } = req.body;
  const user_id = req.user.id;

  console.log('called 1')

  if (!content || !assistantSlug) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  let chatSessionId = session_id;
  let threadId;

  console.log('called')

  try {
    // Create new session + thread if needed
    if (!chatSessionId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;

      const { data: newSession, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert([
          {
            user_id,
            assistant_slug: assistantSlug,
            thread_id: threadId,
            title: 'New Chat',
          },
        ])
        .select()
        .single();

      if (sessionError) throw sessionError;
      chatSessionId = newSession.id;
    } else {
      // Existing session: retrieve thread ID from DB
      const { data: sessionData, error: fetchError } = await supabase
        .from('chat_sessions')
        .select('thread_id')
        .eq('id', chatSessionId)
        .single();

      if (fetchError) throw fetchError;
      threadId = sessionData.thread_id;
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

    let fullAssistantReply = '';

      for await (const event of run) {
          if (event.event === 'thread.message.delta') {
              const delta = event.data.delta?.content?.[0]?.text?.value;
              if (delta) {
                  fullAssistantReply += delta;


                  console.log('delta: ', delta)

                  // 🔹 Send structured JSON message
                  res.write(`data: ${JSON.stringify({ type: 'SUCCESS', message: delta })}\n\n`);
              }
          }

      if (event.event === 'thread.run.completed') {
        // 🔹 Save assistant response
        await supabase.from('chat_messages').insert([
          {
            session_id: chatSessionId,
            sender: 'assistant',
            content: fullAssistantReply,
          },
        ]);

        // 🔹 Send END marker and session ID
        res.write(`data: ${JSON.stringify({ type: 'SESSION', session_id: chatSessionId })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'END' })}\n\n`);
        res.end();
        break;
      }
    }
  } catch (err) {
    console.error('Error in sendMessage:', err);

    // 🔹 Send structured error
    res.write(`data: ${JSON.stringify({ type: 'ERROR', message: err.message })}\n\n`);
    res.end();
  }
};
