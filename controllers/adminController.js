const { 
  grantBetaAccess, 
  getBetaUsers, 
  revokeBetaAccess,
  handleExpiredBetaUsers,
  inviteAndGrantBetaAccess 
} = require("../services/betaUserService");
const { supabase } = require("../config/supabaseClient");
const logger = require('../utils/logger');

exports.grantBetaAccess = async (req, res) => {
  try {
    let { userEmail, betaPlan, startDate, durationDays } = req.body;
    const grantedByAdminId = req.user.id;

    // Trim email
    userEmail = userEmail?.trim();

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

    // Validate email format - requires at least one dot and TLD
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(userEmail)) {
      return res.status(400).json({ 
        error: "Invalid email format. Please provide a valid email address (e.g., user@example.com)." 
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
    logger.logSystemError('Error granting beta access', error, { userEmail, betaPlan, grantedByAdminId });
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
    logger.logSystemError('Error fetching beta users', error, { includeExpired });
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
    logger.logSystemError('Error revoking beta access', error, { userId });
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
    logger.logSystemError('Error fetching dashboard stats', error);
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
    logger.logSystemError('Error processing expired beta users', error);
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
    logger.logSystemError('Error fetching users', error, { search });
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.inviteUser = async (req, res) => {
  try {
    let { userName, userEmail, organizationName, betaPlan, startDate, durationDays } = req.body;
    const grantedByAdminId = req.user.id;

    // Trim input values
    userName = userName?.trim();
    userEmail = userEmail?.trim();
    organizationName = organizationName?.trim();

    // Validate inputs
    if (!userName || !userEmail || !betaPlan || !startDate || !durationDays) {
      return res.status(400).json({ 
        error: "Missing required fields: userName, userEmail, betaPlan, startDate, durationDays" 
      });
    }

    if (!['STARTER', 'PRO', 'ENTERPRISE'].includes(betaPlan)) {
      return res.status(400).json({ 
        error: "Invalid plan. Must be STARTER, PRO, or ENTERPRISE" 
      });
    }

    // Validate email format - requires at least one dot and TLD
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(userEmail)) {
      logger.logInfo('Email validation failed during user invitation', { userEmail });
      return res.status(400).json({ 
        error: "Invalid email format. Please provide a valid email address (e.g., user@example.com)." 
      });
    }

    const result = await inviteAndGrantBetaAccess({
      userName,
      userEmail,
      organizationName: organizationName || '',
      betaPlan,
      startDate: new Date(startDate),
      durationDays: parseInt(durationDays),
      grantedByAdminId
    });

    if (result.success) {
      res.json({ 
        message: "User invited and beta access granted successfully", 
        user: result.user,
        temporaryPassword: result.temporaryPassword
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    logger.logSystemError('Error inviting user', error, { userName, userEmail, betaPlan });
    res.status(500).json({ error: "Internal server error" });
  }
};

// System Logs Management
exports.getSystemLogs = async (req, res) => {
  try {
    const {
      level = 'all',
      source = 'all',
      page = 1,
      limit = 50,
      search = '',
      startDate,
      endDate
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    let query = supabase
      .from('system_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Apply filters
    if (level !== 'all') {
      query = query.eq('level', level);
    }

    if (source !== 'all') {
      query = query.eq('source', source);
    }

    if (search) {
      query = query.ilike('message', `%${search}%`);
    }

    if (startDate) {
      query = query.gte('created_at', new Date(startDate).toISOString());
    }

    if (endDate) {
      query = query.lte('created_at', new Date(endDate).toISOString());
    }

    // Apply pagination
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data: logs, error, count } = await query;

    if (error) {
      throw error;
    }

    // Log admin access to logs
    logger.logAdminAction('Admin viewed system logs', req.user.id, {
      filters: { level, source, search, startDate, endDate },
      page: parseInt(page),
      limit: parseInt(limit),
      resultCount: logs?.length || 0
    });

    res.json({
      logs: logs || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / parseInt(limit))
      }
    });

  } catch (error) {
    logger.logSystemError('Failed to fetch system logs', error, { 
      adminUserId: req.user.id,
      filters: req.query 
    });
    res.status(500).json({ error: 'Failed to fetch system logs' });
  }
};

exports.getLogStats = async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get error counts for different time periods
    const [errors24h, errors7d, errors30d, topSources, levelDistribution] = await Promise.all([
      // Errors in last 24 hours
      supabase
        .from('system_logs')
        .select('*', { count: 'exact', head: true })
        .eq('level', 'error')
        .gte('created_at', last24h.toISOString()),

      // Errors in last 7 days
      supabase
        .from('system_logs')
        .select('*', { count: 'exact', head: true })
        .eq('level', 'error')
        .gte('created_at', last7d.toISOString()),

      // Errors in last 30 days
      supabase
        .from('system_logs')
        .select('*', { count: 'exact', head: true })
        .eq('level', 'error')
        .gte('created_at', last30d.toISOString()),

      // Top sources (last 7 days)
      supabase
        .from('system_logs')
        .select('source')
        .gte('created_at', last7d.toISOString())
        .not('source', 'is', null),

      // Level distribution (last 7 days)
      supabase
        .from('system_logs')
        .select('level')
        .gte('created_at', last7d.toISOString())
    ]);

    // Process top sources
    const sourceCount = {};
    topSources.data?.forEach(log => {
      sourceCount[log.source] = (sourceCount[log.source] || 0) + 1;
    });

    const topSourcesArray = Object.entries(sourceCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([source, count]) => ({ source, count }));

    // Process level distribution
    const levelCount = {};
    levelDistribution.data?.forEach(log => {
      levelCount[log.level] = (levelCount[log.level] || 0) + 1;
    });

    const stats = {
      errors: {
        last24h: errors24h.count || 0,
        last7d: errors7d.count || 0,
        last30d: errors30d.count || 0
      },
      topSources: topSourcesArray,
      levelDistribution: [
        { level: 'error', count: levelCount.error || 0 },
        { level: 'warn', count: levelCount.warn || 0 },
        { level: 'info', count: levelCount.info || 0 },
        { level: 'debug', count: levelCount.debug || 0 }
      ],
      generatedAt: now.toISOString()
    };

    // Log admin access to stats
    logger.logAdminAction('Admin viewed log statistics', req.user.id, {
      statsGenerated: stats
    });

    res.json(stats);

  } catch (error) {
    logger.logSystemError('Failed to fetch log statistics', error, { 
      adminUserId: req.user.id 
    });
    res.status(500).json({ error: 'Failed to fetch log statistics' });
  }
};

exports.cleanupOldLogs = async (req, res) => {
  try {
    // Call the database cleanup function
    const { data, error } = await supabase
      .rpc('cleanup_old_system_logs');

    if (error) {
      throw error;
    }

    const deletedCount = data || 0;

    logger.logAdminAction('Admin triggered manual log cleanup', req.user.id, {
      deletedCount
    });

    res.json({
      message: 'Log cleanup completed successfully',
      deletedCount
    });

  } catch (error) {
    logger.logSystemError('Failed to cleanup old logs', error, { 
      adminUserId: req.user.id 
    });
    res.status(500).json({ error: 'Failed to cleanup logs' });
  }
};