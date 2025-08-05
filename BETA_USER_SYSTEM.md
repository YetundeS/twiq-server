# Beta User Management System

This document outlines the beta user management system implementation for TWIQ platform.

## Overview

The beta user system allows administrators to grant temporary access to any subscription plan (STARTER/PRO/ENTERPRISE) with customizable duration and start dates. The system includes:

- Flexible plan assignment
- Custom duration setting
- Admin panel for management
- Automatic expiration handling
- Email notifications
- Conversion tracking

## Database Schema Changes

The following fields were added to the `profiles` table:

```sql
-- Beta User Management
is_beta_user boolean default false,
beta_plan text, -- 'STARTER', 'PRO', 'ENTERPRISE'
beta_start_date timestamp,
beta_end_date timestamp,
beta_granted_by uuid,
beta_converted boolean default false,

-- Admin Management  
is_admin boolean default false,
```

## Environment Variables

Add the following variables to your `.env` file:

```bash
# Admin Configuration
ADMIN_EMAILS=admin@example.com,admin2@example.com
BETA_NOTIFICATION_DAYS=7,3,1

# Frontend Environment Variables (add to .env.local in frontend)
NEXT_PUBLIC_ADMIN_EMAILS=admin@example.com,admin2@example.com
```

## Admin Access

### Setting Up Admin Users

There are two ways to grant admin access:

1. **Database Method**: Set `is_admin = true` in the profiles table
2. **Environment Variable Method**: Add the user's email to `ADMIN_EMAILS`

### Admin Login Flow

When an admin user logs in:
1. The system checks if the user has admin privileges
2. If admin, they are redirected to `/platform/{slug}/admin` instead of the regular dashboard
3. Admin panel provides full beta user management capabilities

## API Endpoints

### Admin Routes (`/api/admin/`)

All admin routes require authentication and admin privileges.

- `POST /beta-users` - Grant beta access
- `GET /beta-users` - List beta users  
- `DELETE /beta-users/:userId` - Revoke beta access
- `GET /dashboard-stats` - Get beta user statistics
- `GET /users` - Get all users for selection
- `POST /process-expired-beta` - Process expired beta users

### Example Request Bodies

**Grant Beta Access:**
```json
{
  "userEmail": "user@example.com",
  "betaPlan": "PRO",
  "startDate": "2024-01-01",
  "durationDays": 90
}
```

## Admin Panel Features

### Dashboard Statistics
- Total beta users
- Active beta users  
- Converted users
- Conversion rate
- Plan distribution

### Beta User Management
- View all beta users with status
- Filter expired/active users
- Grant new beta access
- Revoke existing access
- User search functionality

### Add Beta User Dialog
- Search and select users
- Choose plan (STARTER/PRO/ENTERPRISE)
- Set start date
- Select duration (30, 60, 90, 180, 365 days)

## User Access Logic

The system now checks beta status before regular subscription:

1. If user is marked as beta user (`is_beta_user = true`)
2. Check if beta period is still active
3. If active, user gets access to their `beta_plan` 
4. If expired, beta flags are cleared and regular subscription logic applies

## Email Notifications

### Beta Access Granted
- Sent when admin grants beta access
- Includes plan details and expiration date
- Provides login link

### Expiration Warnings
- Automatically sent based on `BETA_NOTIFICATION_DAYS`
- Default: 7, 3, and 1 days before expiration
- Includes upgrade call-to-action

## Cron Jobs / Background Tasks

### Daily Beta User Check
Implement a daily job to:
- Check for expired beta users
- Send expiration warning emails
- Deactivate expired accounts
- Update beta user flags

Example implementation:
```javascript
// Add to your cron job or scheduled task
const { handleExpiredBetaUsers, getBetaExpiringUsers } = require('./services/betaUserService');

// Run daily
async function dailyBetaUserCheck() {
  // Handle expired users
  await handleExpiredBetaUsers();
  
  // Send expiration warnings
  const warningDays = [7, 3, 1];
  for (const days of warningDays) {
    const expiringUsers = await getBetaExpiringUsers(days);
    // Send warning emails to expiringUsers
  }
}
```

## File Structure

### Backend Files
```
services/betaUserService.js          # Core beta user logic
middlewares/adminMiddleware.js       # Admin authentication
routes/adminRoutes.js               # Admin API routes
controllers/adminController.js      # Admin route handlers
emails/templates/betaAccessGranted.js    # Email template
emails/templates/betaExpirationWarning.js # Email template
utils/getUserByAuthId.js            # Updated with beta check
```

### Frontend Files
```
app/platform/[slug]/admin/page.jsx          # Admin panel page
components/adminComponents/BetaUserStats.jsx    # Statistics component
components/adminComponents/BetaUserTable.jsx    # User table component  
components/adminComponents/AddBetaUserDialog.jsx # Add user dialog
apiCalls/adminAPI.js                        # Admin API calls
components/authComponents/authForms/login.jsx   # Updated login routing
```

## Security Considerations

1. **Admin Authentication**: All admin routes protected by middleware
2. **Authorization**: Multiple admin verification methods (DB + env vars)
3. **Rate Limiting**: Admin endpoints included in general rate limiting
4. **Audit Trail**: Admin actions logged with `beta_granted_by` field
5. **Input Validation**: All form inputs validated on both client and server

## Usage Instructions

### For Administrators

1. **Access Admin Panel**: Log in with admin credentials, you'll be redirected to admin panel
2. **Grant Beta Access**: 
   - Click "Add Beta User"
   - Search and select user
   - Choose plan and duration
   - Set start date
   - Click "Grant Beta Access"
3. **Manage Users**: View, filter, and revoke beta access as needed
4. **Monitor Stats**: Track conversion rates and user engagement

### For Beta Users

1. **Receive Email**: Get beta access notification email
2. **Login**: Access account normally - beta plan will be active
3. **Use Platform**: Full access to assigned plan features
4. **Expiration Notices**: Receive warnings before expiration
5. **Upgrade**: Convert to paid subscription before expiration

## Troubleshooting

### Common Issues

1. **Admin can't access panel**: Check `is_admin` flag or `ADMIN_EMAILS` env var
2. **Beta user can't access features**: Verify beta dates and plan assignment
3. **Emails not sending**: Check email service configuration
4. **Users not appearing in search**: Ensure they're not already beta users

### Database Queries

**Check beta users:**
```sql
SELECT email, beta_plan, beta_start_date, beta_end_date, is_active 
FROM profiles 
WHERE is_beta_user = true;
```

**Set admin user:**
```sql
UPDATE profiles SET is_admin = true WHERE email = 'admin@example.com';
```

## Future Enhancements

- Bulk beta user import
- Custom email templates per plan
- Beta user usage analytics
- Automated conversion follow-up
- Integration with marketing tools