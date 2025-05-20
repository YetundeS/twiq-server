const supabase = require('../config/supabaseClient');
const { getUserByAuthId } = require('../utils/getUserByAuthId');

exports.isAuthenticatedUser = async (req, res, next) => {
    try {
        const token = req.cookies?.access_token;

        // If no token is found, reject the request
        if (!token) {
            // console.log('unauthenticated')
            return res.status(401).json({ error: 'Access denied. You have to login.' });
        }

        // Validate the token with Supabase
        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data.user) {
            return res.status(401).json({ error: 'Invalid or expired token. You have to login.' });
        }

        // Attach the user to the request object

        let user = await getUserByAuthId(data?.user?.id)
        req.user = user;
        next(); // Continue to the next middleware or route handler
    } catch (err) {
        // console.error('Authentication error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};
