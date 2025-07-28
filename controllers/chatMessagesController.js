const { supabase } = require('../config/supabaseClient');
const { COACH_ASSISTANTS, ASSISTANT_MODEL_NAMES } = require('../constants');
const openai = require('../openai');
const { generateCustomSessionTitle, checkIfEnoughQuota, categorizeFiles } = require('../services/chatMessageService');
const { encoding_for_model } = require('@dqbd/tiktoken');
const { hasAccess } = require('../utils/userAccess');
const encoding = encoding_for_model('gpt-4o'); // adjust based on your model
const fs = require('fs');



exports.sendMessage = async (req, res) => {
  // Handle both form data and JSON
  let session_id, content, assistantSlug;

  if (req.files && req.files.length > 0) {
    session_id = req.body.session_id;
    content = req.body.content;
    assistantSlug = req.body.assistantSlug;
  } else {
    ({ session_id, content, assistantSlug } = req.body);
  }

  const user = req.user;
  const user_id = user.id;
  const uploadedFiles = req.files || [];

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
  const allowed = hasAccess(subscriptionPlan, ASSISTANT_MODEL_NAMES[assistantSlug]);
  if (!allowed) {
    return res.status(403).json({
      error: `Your current plan (${subscriptionPlan}) does not allow access to the "${ASSISTANT_MODEL_NAMES[assistantSlug]}" model.`,
    });
  }

  let chatSessionId = session_id;
  let threadId;
  let chatSession;
  let generatedTitle = 'New Chat';

  // Only categorize files if they exist
  const hasFiles = uploadedFiles && uploadedFiles.length > 0;
  let textFileIds = [];
  let imageFileIds = [];
  let tempFilePaths = [];

  if (hasFiles) {
    const { textFiles, imageFiles } = categorizeFiles(uploadedFiles);
    
    try {
      // Upload text files to OpenAI (these will use file_search)
      if (textFiles.length > 0) {
        for (const file of textFiles) {
          try {
            const fileStream = fs.createReadStream(file.path);
            const fileUploadResponse = await openai.files.create({
              file: fileStream,
              purpose: 'assistants',
            });

            textFileIds.push({
              id: fileUploadResponse.id,
              name: file.originalname,
              size: file.size,
              type: file.mimetype,
            });

            tempFilePaths.push(file.path);
          } catch (fileError) {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
            return res.status(500).json({
              error: `Failed to upload text file "${file.originalname}": ${fileError.message}`
            });
          }
        }
      }

      // Upload image files to OpenAI (these will be in message content)
      if (imageFiles.length > 0) {
        for (const file of imageFiles) {
          try {
            const fileStream = fs.createReadStream(file.path);
            const fileUploadResponse = await openai.files.create({
              file: fileStream,
              purpose: 'vision',
            });

            imageFileIds.push({
              id: fileUploadResponse.id,
              name: file.originalname,
              size: file.size,
              type: file.mimetype,
            });

            tempFilePaths.push(file.path);
          } catch (fileError) {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
            return res.status(500).json({
              error: `Failed to upload image file "${file.originalname}": ${fileError.message}`
            });
          }
        }
      }
    } catch (err) {
      return res.status(500).json({ error: 'Failed to process uploaded files' });
    }
  }

  try {
    // Create session + thread if needed
    if (!chatSessionId) {
      // Generate custom chat session title for new chats
      try {
        const totalFiles = hasFiles ? uploadedFiles.length : 0;
        const titleContent = totalFiles > 0 ?
          `${content} (with ${totalFiles} file${totalFiles > 1 ? 's' : ''}: ${uploadedFiles.map(f => f.originalname).join(', ')})` :
          content;
        const customTitle = await generateCustomSessionTitle(titleContent);
        if (customTitle) generatedTitle = customTitle;
      } catch (titleGenError) {
        // Use fallback title
      }

      // Create thread - only include files if they exist
      let threadOptions = {};

      if (hasFiles && (textFileIds.length > 0 || imageFileIds.length > 0)) {
        // Build message content
        const messageContent = [{ type: 'text', text: content }];

        // Add images to message content
        imageFileIds.forEach(imageFile => {
          messageContent.push({
            type: 'image_file',
            image_file: { file_id: imageFile.id }
          });
        });

        threadOptions = {
          messages: [{
            role: 'user',
            content: messageContent,
            // Only attach text files to file_search
            ...(textFileIds.length > 0 && {
              attachments: textFileIds.map(fileInfo => ({
                file_id: fileInfo.id,
                tools: [{ type: 'file_search' }],
              }))
            })
          }],
        };
      } else {
        // No files - create thread with just text message
        threadOptions = {
          messages: [{
            role: 'user',
            content: content
          }]
        };
      }

      const thread = await openai.beta.threads.create(threadOptions);
      threadId = thread.id;

      const { data: newSession, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert([{
          user_id,
          assistant_slug: assistantSlug,
          thread_id: threadId,
          title: generatedTitle,
        }])
        .select()
        .single();

      if (sessionError) throw sessionError;
      chatSessionId = newSession.id;
      chatSession = newSession;
    } else {
      // Existing session
      const { data: sessionData, error: fetchError } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('id', chatSessionId)
        .single();

      if (fetchError) throw fetchError;
      threadId = sessionData.thread_id;
      chatSession = sessionData;
    }

    // Save user message
    const { data: savedMessage, error: messageError } = await supabase
      .from('chat_messages')
      .insert([{
        session_id: chatSessionId,
        sender: 'user',
        content: content,
        has_files: hasFiles,
      }])
      .select()
      .single();

    if (messageError) throw messageError;

    // Save file records only if files exist
    if (hasFiles && savedMessage) {
      const allFileIds = [...textFileIds, ...imageFileIds];
      if (allFileIds.length > 0) {
        const fileRecords = allFileIds.map(fileInfo => ({
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
    }

    // Add message to existing thread (if thread wasn't created with the message)
    if (session_id) {
      if (hasFiles && (textFileIds.length > 0 || imageFileIds.length > 0)) {
        // Build message content with files
        const messageContent = [{ type: 'text', text: content }];

        // Add images to message content
        imageFileIds.forEach(imageFile => {
          messageContent.push({
            type: 'image_file',
            image_file: { file_id: imageFile.id }
          });
        });

        const messageOptions = {
          role: 'user',
          content: messageContent,
          // Only attach text files to file_search
          ...(textFileIds.length > 0 && {
            attachments: textFileIds.map(fileInfo => ({
              file_id: fileInfo.id,
              tools: [{ type: 'file_search' }],
            }))
          })
        };

        await openai.beta.threads.messages.create(threadId, messageOptions);
      } else {
        // No files - just add text message
        await openai.beta.threads.messages.create(threadId, {
          role: 'user',
          content: content
        });
      }
    }

    const assistantId = COACH_ASSISTANTS[assistantSlug];

    // Create run with appropriate instructions
    const runOptions = {
      assistant_id: assistantId,
      stream: true,
    };

    // FIXED: Only add file-related instructions if files were actually uploaded
    if (hasFiles && (textFileIds.length > 0 || imageFileIds.length > 0)) {
      const instructions = [];

      if (textFileIds.length > 0) {
        const textFileNames = textFileIds.map(f => f.name).join(', ');
        instructions.push(`Reference the uploaded document${textFileIds.length > 1 ? 's' : ''} (${textFileNames}) when relevant and cite which document the information comes from.`);
      }

      if (imageFileIds.length > 0) {
        const imageFileNames = imageFileIds.map(f => f.name).join(', ');
        instructions.push(`Analyze the uploaded image${imageFileIds.length > 1 ? 's' : ''} (${imageFileNames}) and describe what you see when relevant.`);
      }

      runOptions.instructions = instructions.join(' ');
    } else {
      // ADDED: Explicitly tell the assistant no files are attached
      runOptions.instructions = "No files have been uploaded with this message. Respond normally without expecting any file attachments.";
    }

    const run = await openai.beta.threads.runs.create(threadId, runOptions);

    // Setup SSE streaming 
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
        await supabase.from('chat_messages').insert([{
          session_id: chatSessionId,
          sender: 'assistant',
          content: fullAssistantReply,
          status: 'complete',
        }]);

        // Token counting and usage update
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

    // Handle disconnection 
    if (clientDisconnected && fullAssistantReply.trim()) {
      await supabase.from('chat_messages').insert([{
        session_id: chatSessionId,
        sender: 'assistant',
        content: fullAssistantReply,
        status: 'incomplete',
      }]);
    }

  } catch (err) {
    if (!res.headersSent) {
      res.status(500);
      res.write(`data: ${JSON.stringify({ type: 'ERROR', message: err.message })}\n\n`);
      res.end();
    }
  } finally {
    // Clean up TEMP files (local disk files)
    tempFilePaths.forEach(path => {
      if (fs.existsSync(path)) {
        fs.unlinkSync(path);
      }
    });
  }
};