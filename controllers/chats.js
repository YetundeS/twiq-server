// controller/chats.js

const supabase = require("../config/supabaseClient");
const { getAssistantId } = require("../constants");
const openai = require("../openai");

// exports.createNewChat = async (req, res) => {
//     const { userId, assistantSlug } = req.body;

//     if (!userId || !assistantSlug) {
//         return res.status(400).json({ error: "user id and assistant slug are required." });
//     }

//     try {
//         const thread = await openai.beta.threads.create();

//         const { data, error } = await supabase.from('chat_sessions').insert([
//             {
//                 user_id: userId,
//                 assistant_slug: assistantSlug,
//                 thread_id: thread.id,
//             },
//         ]).select().single();

//         if (error) return res.status(400).json({ error });
//         res.json({ chatId: data.id });
//     } catch (error) {
//         console.error("New chat creation error:", error);
//         res.status(500).json({ error: "Internal server error" });
//     }
// };


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


// exports.streamAssistantResponse = async (req, res) => {
//     const { chatId } = req.params;
//     const { message } = req.query;

//     if (!chatId || !message) {
//         return res.status(400).json({ error: "chat id and message are required." });
//     }


//     try {
//         const session = await supabase.from('chat_sessions').select('*').eq('id', chatId).single();
//         if(!session.data) {
//             return res.status(404).json({ error: "Can't find chat session"})
//         }
//         const threadId = session.data?.thread_id;
//         const assistantId = getAssistantId(session.data.assistant_slug); // use a map

//         res.setHeader('Content-Type', 'text/event-stream');
//         res.setHeader('Cache-Control', 'no-cache');
//         res.setHeader('Connection', 'keep-alive');
//         res.flushHeaders();

//         await openai.beta.threads.messages.create(threadId, {
//             role: 'user',
//             content: message,
//         });

//         const run = await openai.beta.threads.runs.create(threadId, {
//             assistant_id: assistantId,
//             stream: true,
//         });

//         for await (const event of run) {
//             if (event.event === 'thread.message.delta') {
//                 const delta = event.data.delta?.content?.[0]?.text?.value;
//                 if (delta) {
//                     res.write(`data: ${delta}\n\n`);
//                 }
//             }
//             if (event.event === 'thread.run.completed') {
//                 res.write(`event: done\ndata: done\n\n`);
//                 res.end();
//                 break;
//             }
//         }
//     } catch (error) {
//         console.error("Assistant streaming error:", error);
//         res.status(500).json({ error: "Internal server error" });
//     }
// };