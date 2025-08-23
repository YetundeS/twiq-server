const { supabase } = require("../config/supabaseClient");

const adminMiddleware = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: No user ID found" });
    }

    const { data: user, error } = await supabase
      .from('profiles')
      .select('is_admin, email')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(403).json({ error: "Access denied: User not found" });
    }

    // Check if user is admin - database is the single source of truth
    if (!user.is_admin) {
      return res.status(403).json({ error: "Access denied: Admin privileges required" });
    }

    // Add admin info to request
    req.isAdmin = true;
    req.adminEmail = user.email;
    
    next();
  } catch (error) {
    console.error("Admin middleware error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = adminMiddleware;