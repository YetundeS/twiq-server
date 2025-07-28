const { supabase } = require('../config/supabaseClient');
const { COACH_ASSISTANTS, ASSISTANT_MODEL_NAMES } = require('../constants');
const openai = require('../openai');
const { generateCustomSessionTitle, checkIfEnoughQuota, categorizeFiles } = require('../services/chatMessageService');
const { countTokens } = require('../utils/tokenEncoder');
const { hasAccess } = require('../utils/userAccess');
const { compressImage, isCompressibleImage, getOptimalCompressionSettings } = require('../utils/imageCompressor');
const fs = require('fs');
const fsPromises = require('fs').promises;



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
      // Prepare all file uploads in parallel
      const uploadPromises = [];
      
      // Prepare text file uploads
      textFiles.forEach(file => {
        const uploadPromise = (async () => {
          try {
            const fileStream = fs.createReadStream(file.path);
            const fileUploadResponse = await openai.files.create({
              file: fileStream,
              purpose: 'assistants',
            });

            tempFilePaths.push(file.path);
            
            return {
              type: 'text',
              success: true,
              data: {
                id: fileUploadResponse.id,
                name: file.originalname,
                size: file.size,
                type: file.mimetype,
              }
            };
          } catch (fileError) {
            return {
              type: 'text',
              success: false,
              error: fileError.message,
              fileName: file.originalname,
              filePath: file.path
            };
          } finally {
            // Ensure stream is closed
            fileStream.destroy();
          }
        })();
        
        uploadPromises.push(uploadPromise);
      });

      // Prepare image file uploads with compression
      imageFiles.forEach(file => {
        const uploadPromise = (async () => {
          let filePathToUpload = file.path;
          let compressedPath = null;
          
          try {
            // Check if image should be compressed
            if (isCompressibleImage(file.mimetype) && file.size > 1024 * 1024) { // Compress if > 1MB
              const compressionSettings = getOptimalCompressionSettings(file.size, file.mimetype);
              const compressionResult = await compressImage(file.path, compressionSettings);
              
              if (compressionResult.success) {
                filePathToUpload = compressionResult.compressedPath;
                compressedPath = compressionResult.compressedPath;
                tempFilePaths.push(compressedPath);
                
                console.log(`Compressed ${file.originalname}: ${compressionResult.originalSize} -> ${compressionResult.compressedSize} (${compressionResult.compressionRatio}% reduction)`);
              }
            }
            
            const fileStream = fs.createReadStream(filePathToUpload);
            const fileUploadResponse = await openai.files.create({
              file: fileStream,
              purpose: 'vision',
            });

            tempFilePaths.push(file.path);
            
            return {
              type: 'image',
              success: true,
              data: {
                id: fileUploadResponse.id,
                name: file.originalname,
                size: compressedPath ? (await fsPromises.stat(compressedPath)).size : file.size,
                type: file.mimetype,
              }
            };
          } catch (fileError) {
            return {
              type: 'image',
              success: false,
              error: fileError.message,
              fileName: file.originalname,
              filePath: file.path
            };
          } finally {
            // Ensure stream is closed
            if (fileStream && !fileStream.destroyed) {
              fileStream.destroy();
            }
          }
        })();
        
        uploadPromises.push(uploadPromise);
      });

      // Execute all uploads in parallel
      const uploadResults = await Promise.all(uploadPromises);

      // Process results
      const failedUploads = [];
      
      uploadResults.forEach(result => {
        if (result.success) {
          if (result.type === 'text') {
            textFileIds.push(result.data);
          } else {
            imageFileIds.push(result.data);
          }
        } else {
          failedUploads.push(result);
          // Clean up failed upload (async)
          try {
            await fsPromises.access(result.filePath);
            await fsPromises.unlink(result.filePath);
          } catch (err) {
            // File might already be deleted
          }
        }
      });

      // If any uploads failed, return error
      if (failedUploads.length > 0) {
        // Clean up all temp files (async)
        await Promise.all(tempFilePaths.map(async (path) => {
          try {
            await fsPromises.access(path);
            await fsPromises.unlink(path);
          } catch (err) {
            // File might already be deleted
          }
        }));
        
        const errorMessages = failedUploads.map(f => `${f.fileName}: ${f.error}`).join(', ');
        return res.status(500).json({
          error: `Failed to upload files: ${errorMessages}`
        });
      }
    } catch (err) {
      // Clean up all temp files on general error (async)
      await Promise.all(tempFilePaths.map(async (path) => {
        try {
          await fsPromises.access(path);
          await fsPromises.unlink(path);
        } catch (err) {
          // File might already be deleted
        }
      }));
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

    // Setup SSE streaming with backpressure handling
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Send keep-alive pings every 5 seconds
    const pingInterval = setInterval(() => {
      if (!clientDisconnected && !res.writableEnded) {
        res.write(': ping\n\n');
      }
    }, 5000);

    let fullAssistantReply = '';
    let clientDisconnected = false;
    let assistantStarted = false;
    let messageBuffer = [];
    let isWriting = false;

    // Handle client disconnect
    req.on('close', () => {
      clientDisconnected = true;
      clearInterval(pingInterval);
    });

    // Handle backpressure
    const writeToStream = async (data) => {
      if (clientDisconnected || res.writableEnded) return false;
      
      return new Promise((resolve) => {
        const canContinue = res.write(data);
        if (!canContinue) {
          // Handle backpressure - wait for drain event
          res.once('drain', () => resolve(true));
        } else {
          resolve(true);
        }
      });
    };

    // Process buffered messages
    const processBuffer = async () => {
      if (isWriting || messageBuffer.length === 0) return;
      
      isWriting = true;
      while (messageBuffer.length > 0 && !clientDisconnected) {
        const message = messageBuffer.shift();
        await writeToStream(message);
      }
      isWriting = false;
    };

    // Send initial session data
    await writeToStream(`data: ${JSON.stringify({ type: 'SESSION', chatSession: chatSession })}\n\n`);

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
          
          // Buffer the message
          messageBuffer.push(`data: ${JSON.stringify({ type: 'SUCCESS', message: delta })}\n\n`);
          
          // Process buffer without blocking
          setImmediate(processBuffer);
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

        // Token counting and usage update (using optimized encoder)
        const modelName = 'gpt-4o'; // or get from assistant config
        const inputTokens = countTokens(content, modelName);
        const outputTokens = countTokens(fullAssistantReply, modelName);

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

        // Ensure all buffered messages are sent before ending
        await processBuffer();
        await writeToStream(`data: ${JSON.stringify({ type: 'END' })}\n\n`);
        res.end();
        clearInterval(pingInterval);
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
    // Clean up TEMP files (local disk files) - async
    await Promise.all(tempFilePaths.map(async (path) => {
      try {
        await fsPromises.access(path);
        await fsPromises.unlink(path);
      } catch (err) {
        // File might already be deleted or inaccessible
      }
    }));
  }
};