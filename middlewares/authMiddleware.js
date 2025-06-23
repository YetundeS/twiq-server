const { supabase } = require('../config/supabaseClient');
const { getUserByAuthId } = require('../utils/getUserByAuthId');

exports.isAuthenticatedUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Please Login' });
    }

    const token = authHeader.split(' ')[1];

    // Validate token with Supabase
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ error: 'Unauthorized: Please login' });
    }

    // Fetch your app's user by Supabase UID
    const user = await getUserByAuthId(data.user.id);

    if (user?.error) {
      return res.status(401).json({ error: 'User does not exist.' });
    }

    // Attach app user info + auth ID
    req.user = {
      ...user,
      auth_id: data.user.id  // <- Add the Supabase Auth ID here
    };

    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
