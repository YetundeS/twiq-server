// controller/chats.js

const supabase = require("../config/supabaseClient");
const { getAssistantId } = require("../constants");
const openai = require("../openai");

exports.listChatSessionsPerModel = async (req, res) => {
    const { userId, assistantSlug } = req.query;

    if (!userId || !assistantSlug) {
        return res.status(400).json({ error: "user id and assistant slug are required." });
    }

    try {
        const { data, error } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('user_id', userId)
            .eq('assistant_slug', assistantSlug)
            .order('created_at', { ascending: false });

        if (error) return res.status(400).json({ error });
        res.json(data);
    } catch (error) {
        console.error("Assistant chats extraction error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};




exports.listAllChatSessions = async (req, res) => {
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
    }


    try {
        const { data, error } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error });
        res.json(data);
    } catch (error) {
        console.error("Sessions chats extraction error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}


exports.getMessagesBySession = async (req, res) => {
  const { sessionId } = req.params;
  const user_id = req.user?.id;

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing session ID' });
  }

  if (!user_id) {
    return res.status(401).json({ error: 'Unauthorized: No user found' });
  }

  try {
    // 🔒 Step 1: Ensure the session belongs to the user
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id, user_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    if (session.user_id !== user_id) {
      return res.status(403).json({ error: 'Forbidden: You do not own this session' });
    }

    // ✅ Step 2: Fetch messages
    const { data: messages, error: messageError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (messageError) throw messageError;

    return res.status(200).json({ messages });
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
  console.log('started')

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