// controller/chats.js

const supabase = require("../config/supabaseClient");
const { getAssistantId } = require("../constants");
const openai = require("../openai");

exports.createNewChat = async (req, res) => {
    const { userId, assistantSlug } = req.body;

    const thread = await openai.beta.threads.create();

    const { data, error } = await supabase.from('chat_sessions').insert([
        {
            user_id: userId,
            assistant_slug: assistantSlug,
            thread_id: thread.id,
        },
    ]).select().single();

    if (error) return res.status(400).json({ error });
    res.json({ chatId: data.id });
};

exports.listChatSessionsPerModel = async (req, res) => {
    const { userId, assistantSlug } = req.query;

    const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('assistant_slug', assistantSlug)
        .order('updated_at', { ascending: false });

    if (error) return res.status(400).json({ error });
    res.json(data);
};


exports.streamAssistantResponse = async (req, res) => {
    const { chatId } = req.params;
    const { message } = req.query;

    const session = await supabase.from('chat_sessions').select('*').eq('id', chatId).single();
    const threadId = session.data.thread_id;
    const assistantId = getAssistantId(session.data.assistant_slug); // use a map

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: message,
    });

    const run = await openai.beta.threads.runs.create(threadId, {
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
            res.write(`event: done\ndata: done\n\n`);
            res.end();
            break;
        }
    }
};


exports.listAllChatSessions = async (req, res) => {
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
    }

    const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

    if (error) return res.status(500).json({ error });
    res.json(data);
}