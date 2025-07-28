// controller/chats.js

const { supabase } = require("../config/supabaseClient");

exports.listChatSessionsPerModel = async (req, res) => {
    const { userId, assistantSlug, page = 1, limit = 20 } = req.query;

    if (!userId || !assistantSlug) {
        return res.status(400).json({ error: "user id and assistant slug are required." });
    }

    // Convert to numbers and validate
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Max 100 items per page
    const offset = (pageNum - 1) * limitNum;

    try {
        // Get total count for pagination metadata
        const { count: totalCount, error: countError } = await supabase
            .from('chat_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('assistant_slug', assistantSlug);

        if (countError) throw countError;

        // Get paginated data
        const { data, error } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('user_id', userId)
            .eq('assistant_slug', assistantSlug)
            .order('created_at', { ascending: false })
            .range(offset, offset + limitNum - 1);

        if (error) return res.status(400).json({ error });
        
        // Return paginated response with metadata
        res.json({
            data,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitNum),
                hasMore: offset + limitNum < totalCount
            }
        });
    } catch (error) {
        console.error("Assistant chats extraction error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};




exports.listAllChatSessions = async (req, res) => {
    const { userId, page = 1, limit = 20 } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
    }

    // Convert to numbers and validate
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Max 100 items per page
    const offset = (pageNum - 1) * limitNum;

    try {
        // Get total count for pagination metadata
        const { count: totalCount, error: countError } = await supabase
            .from('chat_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (countError) throw countError;

        // Get paginated data
        const { data, error } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limitNum - 1);

        if (error) return res.status(500).json({ error });
        
        // Return paginated response with metadata
        res.json({
            data,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitNum),
                hasMore: offset + limitNum < totalCount
            }
        });
    } catch (error) {
        console.error("Sessions chats extraction error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}


exports.getMessagesBySession = async (req, res) => {
  const { sessionId } = req.params;
  const { assistantSlug, page = 1, limit = 50 } = req.query;
  const user_id = req.user?.id;

  if (!sessionId || !assistantSlug) {
    return res.status(400).json({ error: 'Missing session ID or assistantSlug' });
  }

  if (!user_id) {
    return res.status(401).json({ error: 'Unauthorized: No user found' });
  }

  // Convert to numbers and validate
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit))); // Max 200 messages per page
  const offset = (pageNum - 1) * limitNum;

  try {
    // 🔒 Step 1: Ensure the session belongs to the user and matches assistantSlug
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id, user_id, assistant_slug')
      .eq('id', sessionId)
      .eq('user_id', user_id)
      .eq('assistant_slug', assistantSlug)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Chat session not found or does not match assistantSlug' });
    }

    // Get total count for pagination
    const { count: totalCount, error: countError } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    if (countError) throw countError;

    // ✅ Step 2: Fetch paginated messages
    const { data: messages, error: messageError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limitNum - 1);

    if (messageError) throw messageError;

    // Extract message IDs for file lookup
    const messageIds = messages.map(m => m.id);

    // ✅ Step 3: Fetch files only for the paginated messages
    const { data: sessionFiles, error: filesError } = await supabase
      .from('chat_files')
      .select('message_id, file_name, file_size, file_type, openai_file_id')
      .eq('session_id', sessionId)
      .eq('user_id', user_id)
      .in('message_id', messageIds); // Only get files for current page messages

    if (filesError) throw filesError;

    // ✅ Step 4: Group files by message_id for efficient lookup
    const filesByMessageId = {};
    if (sessionFiles && sessionFiles.length > 0) {
      sessionFiles.forEach(file => {
        if (!filesByMessageId[file.message_id]) {
          filesByMessageId[file.message_id] = [];
        }
        filesByMessageId[file.message_id].push({
          name: file.file_name,
          size: file.file_size,
          type: file.file_type,
          openai_file_id: file.openai_file_id
        });
      });
    }

    // ✅ Step 5: Add linkedFiles property to each message
    const messagesWithFiles = messages.map(message => ({
      ...message,
      linkedFiles: filesByMessageId[message.id] || []
    }));

    return res.status(200).json({ 
      messages: messagesWithFiles,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        hasMore: offset + limitNum < totalCount
      }
    });
  } catch (err) {
    console.error('Error fetching messages:', err.message);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
};



exports.fetchOneChatSession = async (req, res) => {
  const { sessionId } = req.params;
  const user_id = req.user.id;

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing session ID' });
  }
  // console.log('started')

  try {
    const { data: session, error } = await supabase
      .from('chat_sessions')
      .select(`
        id,
        title,
        user_id,
        assistant_slug,
        thread_id
      `)
      .eq('id', sessionId)
      .eq('user_id', user_id)
      .order('created_at', { foreignTable: 'chat_messages', ascending: true })
      .single();

    if (error) {
      return res.status(404).json({ error: 'Chat session not found or access denied' });
    }

    return res.status(200).json({ session });
  } catch (err) {
    console.error('Fetch session error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};




exports.deleteSession = async (req, res) => {

  // Get all OpenAI file IDs for this session
  // const { data: files } = await supabase
  //   .from('chat_files')
  //   .select('openai_file_id')
  //   .eq('session_id', sessionId);

  // if (openaiFileIds.length > 0) {
  //     cleanupFiles(openaiFileIds).catch(cleanupError => {
  //       // log cleanupError
  //     });
  //   }
  
  // // Delete from OpenAI
  // for (const file of files) {
  //   await openai.files.del(file.openai_file_id);
  // }
  
  // Delete session and related data
  // ... your existing deletion logic
}