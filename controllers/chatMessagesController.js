const supabase = require('../config/supabaseClient');

exports.createChatMessage = async (req, res) => {
  const { session_id, sender, content } = req.body;

  if (!session_id || !sender || !content) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert([
        {
          session_id,
          sender,
          content,
        },
      ])
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: data });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
