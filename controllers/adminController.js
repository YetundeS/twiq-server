const { 
  grantBetaAccess, 
  getBetaUsers, 
  revokeBetaAccess,
  handleExpiredBetaUsers 
} = require("../services/betaUserService");
const { supabase } = require("../config/supabaseClient");

exports.grantBetaAccess = async (req, res) => {
  try {
    const { userEmail, betaPlan, startDate, durationDays } = req.body;
    const grantedByAdminId = req.user.id;

    // Validate inputs
    if (!userEmail || !betaPlan || !startDate || !durationDays) {
      return res.status(400).json({ 
        error: "Missing required fields: userEmail, betaPlan, startDate, durationDays" 
      });
    }

    if (!['STARTER', 'PRO', 'ENTERPRISE'].includes(betaPlan)) {
      return res.status(400).json({ 
        error: "Invalid plan. Must be STARTER, PRO, or ENTERPRISE" 
      });
    }

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', userEmail)
      .single();

    if (!existingUser) {
      return res.status(404).json({ error: "User not found with that email" });
    }

    const result = await grantBetaAccess({
      userEmail,
      betaPlan,
      startDate: new Date(startDate),
      durationDays: parseInt(durationDays),
      grantedByAdminId
    });

    if (result.success) {
      res.json({ 
        message: "Beta access granted successfully", 
        user: result.user 
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error("Error granting beta access:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getBetaUsers = async (req, res) => {
  try {
    const { includeExpired } = req.query;
    const betaUsers = await getBetaUsers({ 
      includeExpired: includeExpired === 'true' 
    });

    res.json({ betaUsers });
  } catch (error) {
    console.error("Error fetching beta users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.revokeBetaAccess = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const result = await revokeBetaAccess(userId);

    if (result.success) {
      res.json({ message: "Beta access revoked successfully" });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error("Error revoking beta access:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    // Get beta user statistics
    const { data: stats, error } = await supabase
      .from('profiles')
      .select('is_beta_user, beta_plan, beta_converted, is_active')
      .eq('is_beta_user', true);

    if (error) throw error;

    const totalBetaUsers = stats.length;
    const activeBetaUsers = stats.filter(u => u.is_active).length;
    const convertedUsers = stats.filter(u => u.beta_converted).length;
    
    const planDistribution = stats.reduce((acc, user) => {
      if (user.beta_plan) {
        acc[user.beta_plan] = (acc[user.beta_plan] || 0) + 1;
      }
      return acc;
    }, {});

    res.json({
      totalBetaUsers,
      activeBetaUsers,
      convertedUsers,
      conversionRate: totalBetaUsers > 0 ? (convertedUsers / totalBetaUsers * 100).toFixed(2) : 0,
      planDistribution
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.processExpiredBetaUsers = async (req, res) => {
  try {
    const result = await handleExpiredBetaUsers();
    res.json({ 
      message: `Processed ${result.processedCount} expired beta users`,
      ...result 
    });
  } catch (error) {
    console.error("Error processing expired beta users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const { search } = req.query;
    
    let query = supabase
      .from('profiles')
      .select('id, email, user_name, organization_name, is_active, subscription_plan, is_beta_user')
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`email.ilike.%${search}%,user_name.ilike.%${search}%,organization_name.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ users: data });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};