const supabase = require('../config/supabaseClient');
const { getUserByAuthId } = require('../utils/getUserByAuthId');

exports.isAuthenticatedUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Please Login' });
    }

    const token = authHeader.split(' ')[1];

    // Validate the token with Supabase
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ error: 'Unauthorized:Please login' });
    }

    // Attach full app-specific user to the request
    const user = await getUserByAuthId(data.user.id);
    req.user = user;

    next();
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};
