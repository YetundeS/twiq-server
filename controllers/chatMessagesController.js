const { supabase } = require('../config/supabaseClient');
const { COACH_ASSISTANTS, ASSISTANT_MODEL_NAMES } = require('../constants');
const openai = require('../openai');
const { generateCustomSessionTitle, checkIfEnoughQuota } = require('../services/chatMessageService');
const { encoding_for_model } = require('@dqbd/tiktoken');
const { hasAccess } = require('../utils/userAccess');
const encoding = encoding_for_model('gpt-4'); // adjust based on your model
const fs = require('fs');
const cleanupFiles = require('../services/cleanOpenAIUploads');

exports.sendMessage = async (req, res) => {
  // Handle both form data and JSON
  let session_id, content, assistantSlug;

  if (req.files && req.files.length > 0) {
    // FormData request with files
    session_id = req.body.session_id;
    content = req.body.content;
    assistantSlug = req.body.assistantSlug;
  } else {
    // JSON request without files
    ({ session_id, content, assistantSlug } = req.body);
  }

  const user = req.user;
  const user_id = user.id;
  const uploadedFiles = req.files || []; // Array of files

  if (!user?.is_active) {
    return res.status(403).json({ error: 'Subscription inactive' });
  }

  const check = await checkIfEnoughQuota(user);
  if (check?.error) {
    return res.status(403).json({ error: check?.error || 'Quota Exceeded' });
  }

  if (!content || !content.trim() || !assistantSlug) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const subscriptionPlan = user.subscription_plan || "null";

  // Block access if user doesn't qualify
  const allowed = hasAccess(subscriptionPlan, ASSISTANT_MODEL_NAMES[assistantSlug]);
  if (!allowed) {
    return res.status(403).json({
      error: `Your current plan (${subscriptionPlan}) does not allow access to the "${ASSISTANT_MODEL_NAMES[assistantSlug]}" model.`,
    });
  }

  let chatSessionId = session_id;
  let threadId;
  let chatSession;

  // Generate a title based on first user message
  let generatedTitle = 'New Chat'; // fallback title

  let openaiFileIds = [];

  try {

    // Upload all files to OpenAI if present
    if (uploadedFiles.length > 0) {
      console.log(`Uploading ${uploadedFiles.length} files to OpenAI...`);

      for (const file of uploadedFiles) {
        try {
          console.log(`Uploading file: ${file.originalname} (${file.size} bytes)`);

          // ✅ Use file stream from disk - much more reliable
          const fileStream = fs.createReadStream(file.path);

          const fileUploadResponse = await openai.files.create({
            file: fileStream,
            purpose: 'assistants',
          });

          openaiFileIds.push({
            id: fileUploadResponse.id,
            name: file.originalname,
            size: file.size,
            type: file.mimetype,
            tempPath: file.path, // Store temp path for cleanup
          });

          console.log(`File uploaded to OpenAI: ${file.originalname} -> ${fileUploadResponse.id}`);
        } catch (fileError) {
          console.error(`Error uploading file ${file.originalname} to OpenAI:`, fileError);

          // Clean up temp file on error
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }

          return res.status(500).json({
            error: `Failed to upload file "${file.originalname}": ${fileError.message}`
          });
        }
      }
    }

    // Create session + thread if needed
    if (!chatSessionId) {
      // Generate custom chat session title for new chats
      try {
        const titleContent = uploadedFiles.length > 0 ?
          `${content} (with ${uploadedFiles.length} file${uploadedFiles.length > 1 ? 's' : ''}: ${uploadedFiles.map(f => f.originalname).join(', ')})` :
          content;
        const customTitle = await generateCustomSessionTitle(titleContent);
        if (customTitle) generatedTitle = customTitle;
      } catch (titleGenError) {
        console.warn('Title generation failed, using fallback:', titleGenError.message);
      }

      // Create thread with or without files
      let threadOptions = {};

      if (openaiFileIds.length > 0) {
        threadOptions = {
          messages: [
            {
              role: 'user',
              content: content,
              attachments: openaiFileIds.map(fileInfo => ({
                file_id: fileInfo.id,
                tools: [{ type: 'file_search' }],
              })),
            },
          ],
        };
      }

      const thread = await openai.beta.threads.create(threadOptions);
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
      chatSession = newSession;
    } else {
      const { data: sessionData, error: fetchError } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('id', chatSessionId)
        .single();

      if (fetchError) throw fetchError;
      threadId = sessionData.thread_id;
      chatSession = sessionData;
    }


    // Save user message first
    const { data: savedMessage, error: messageError } = await supabase
      .from('chat_messages')
      .insert([
        {
          session_id: chatSessionId,
          sender: 'user',
          content: content,
          has_files: uploadedFiles.length > 0, // ✅ flag message with files
        },
      ])
      .select()
      .single();

    if (messageError) throw messageError;

    // ✅ Save individual file records
    if (uploadedFiles.length > 0 && savedMessage) {
      const fileRecords = openaiFileIds.map(fileInfo => ({
        user_id: user_id,
        session_id: chatSessionId,
        message_id: savedMessage.id,
        file_name: fileInfo.name,
        file_size: fileInfo.size,
        file_type: fileInfo.type,
        openai_file_id: fileInfo.id,
      }));

      const { error: filesInsertError } = await supabase
        .from('chat_files')
        .insert(fileRecords);

      if (filesInsertError) throw filesInsertError;
    }

    // Add message to OpenAI thread (only if thread wasn't created with the message)
    if (chatSessionId !== chatSession.id || openaiFileIds.length === 0) {
      const messageOptions = {
        role: 'user',
        content: content,
      };

      if (openaiFileIds.length > 0) {
        messageOptions.attachments = openaiFileIds.map(fileInfo => ({
          file_id: fileInfo.id,
          tools: [{ type: 'file_search' }],
        }));
      }

      await openai.beta.threads.messages.create(threadId, messageOptions);
    }

    const assistantId = COACH_ASSISTANTS[assistantSlug];

    // Create run with file search instructions if files are present
    const runOptions = {
      assistant_id: assistantId,
      stream: true,
    };

    if (openaiFileIds.length > 0) {
      const fileNames = openaiFileIds.map(f => f.name).join(', ');
      runOptions.instructions = `Use the uploaded file${openaiFileIds.length > 1 ? 's' : ''} (${fileNames}) to help answer the user's question. Reference specific information from the file${openaiFileIds.length > 1 ? 's' : ''} when relevant and cite which file the information comes from.`;
    }

    const run = await openai.beta.threads.runs.create(threadId, runOptions);

    // Setup SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send keep-alive pings every 5 seconds
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
            clearInterval(pingInterval);
          }
          fullAssistantReply += delta;
          res.write(`data: ${JSON.stringify({ type: 'SUCCESS', message: delta })}\n\n`);
        }
      }

      if (event.event === 'thread.run.completed') {
        // Save assistant message
        const assistantMessageData = {
          session_id: chatSessionId,
          sender: 'assistant',
          content: fullAssistantReply,
          status: 'complete',
        };

        await supabase.from('chat_messages').insert([assistantMessageData]);

        // Estimate tokens
        const inputTokens = encoding.encode(content).length;
        const outputTokens = encoding.encode(fullAssistantReply).length;

        // Update subscription usage
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('subscription_usage')
          .eq('id', user_id)
          .single();

        if (!profileError && profile) {
          const usage = profile.subscription_usage || {
            input_tokens_used: 0,
            output_tokens_used: 0,
            cached_input_tokens_used: 0,
          };

          const updatedUsage = {
            input_tokens_used: usage.input_tokens_used + inputTokens,
            output_tokens_used: usage.output_tokens_used + outputTokens,
            cached_input_tokens_used: usage.cached_input_tokens_used + 0,
          };

          await supabase
            .from('profiles')
            .update({ subscription_usage: updatedUsage })
            .eq('id', user_id);
        }

        res.write(`data: ${JSON.stringify({ type: 'END' })}\n\n`);
        res.end();
        return;
      }
    }

    // Handle disconnection after the loop
    if (clientDisconnected && fullAssistantReply.trim()) {
      console.log('Client disconnected, saving partial reply...');

      await supabase.from('chat_messages').insert([
        {
          session_id: chatSessionId,
          sender: 'assistant',
          content: fullAssistantReply,
          status: 'incomplete',
        },
      ]);
    }

    // Clean up OpenAI files after processing
    // if (openaiFileIds.length > 0) {
    //   // Clean up local temp files
    //   for (const fileInfo of openaiFileIds) {
    //     if (fileInfo.tempPath && fs.existsSync(fileInfo.tempPath)) {
    //       try {
    //         fs.unlinkSync(fileInfo.tempPath);
    //         console.log(`Cleaned up temp file: ${fileInfo.tempPath}`);
    //       } catch (deleteError) {
    //         console.warn(`Failed to delete temp file ${fileInfo.tempPath}:`, deleteError.message);
    //       }
    //     }
    //   }

    //   // Clean up OpenAI files after processing (optional)
    //   for (const fileInfo of openaiFileIds) {
    //     try {
    //       await openai.files.del(fileInfo.id);
    //       console.log(`Cleaned up OpenAI file: ${fileInfo.name} (${fileInfo.id})`);
    //     } catch (deleteError) {
    //       console.warn(`Failed to delete OpenAI file ${fileInfo.name}:`, deleteError.message);
    //     }
    //   }
    // }

  } catch (err) {
    console.error('Error during stream:', err);
    if (!res.headersSent) {
      res.status(500);
      res.write(`data: ${JSON.stringify({ type: 'ERROR', message: err.message })}\n\n`);
      res.end();
    }
  } finally {
    // ALWAYS clean up files, regardless of success or failure
    await cleanupFiles(openaiFileIds);
  }
};