const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { isAuthenticatedUser } = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const { adminLimiter } = require('../middlewares/rateLimitMiddleware');
const { strictSanitization } = require('../middlewares/inputSanitizationMiddleware');

// All admin routes require authentication, admin privileges, rate limiting and input sanitization
router.use(adminLimiter);
router.use(isAuthenticatedUser);
router.use(adminMiddleware);
router.use(strictSanitization);

// Beta user management
router.post("/beta-users", adminController.grantBetaAccess);
router.get("/beta-users", adminController.getBetaUsers);
router.delete("/beta-users/:userId", adminController.revokeBetaAccess);

// User invitation
router.post("/invite-user", adminController.inviteUser);

// Dashboard statistics
router.get("/dashboard-stats", adminController.getDashboardStats);

// Get all users (for beta user selection)
router.get("/users", adminController.getAllUsers);

// Process expired beta users (can be called manually or by cron)
router.post("/process-expired-beta", adminController.processExpiredBetaUsers);

module.exports = router;