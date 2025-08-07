const userInvitationEmail = ({ userName, userEmail, temporaryPassword, betaPlan, endDate, loginUrl }) => {
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long', 
      day: 'numeric'
    });
  };

  const getDurationDays = (endDate) => {
    const days = Math.ceil((new Date(endDate) - new Date()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const durationDays = getDurationDays(endDate);

  return {
    subject: `You're Invited to TWIQ Beta - ${betaPlan} Plan Access`,
    html: `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>You're Invited to TWIQ Beta!</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .plan-badge { display: inline-block; background: #4CAF50; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; margin: 10px 0; }
        .cta-button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        .credentials { background: #fff3cd; padding: 20px; border-left: 4px solid #ffc107; margin: 20px 0; border-radius: 4px; }
        .security-note { background: #f8d7da; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0; border-radius: 4px; }
        .trial-info { background: #d4edda; padding: 15px; border-left: 4px solid #28a745; margin: 20px 0; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 You're Invited to TWIQ!</h1>
          <p>Welcome to our exclusive beta program</p>
        </div>
        
        <div class="content">
          <h2>Hi ${userName},</h2>
          
          <p>Congratulations! You've been invited to join our TWIQ platform beta program. We've created an account for you with exclusive access to our AI-powered content creation tools.</p>
          
          <div class="credentials">
            <h3>🔐 Your Login Credentials</h3>
            <p><strong>Username/Email:</strong> ${userEmail}</p>
            <p><strong>Temporary Password:</strong> <code style="background: #e9ecef; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${temporaryPassword}</code></p>
          </div>

          <div class="security-note">
            <h4>🛡️ Important Security Notice</h4>
            <p>For your security, please change this temporary password immediately after your first login. You can do this in your account settings.</p>
          </div>
          
          <div class="trial-info">
            <h3>🚀 Your Trial Details</h3>
            <span class="plan-badge">${betaPlan} Plan</span><br>
            <strong>Trial Duration:</strong> ${durationDays} days<br>
            <strong>Access until:</strong> ${formatDate(endDate)}
          </div>
          
          <p>During your ${durationDays}-day trial, you'll have full access to all features included in the ${betaPlan} plan:</p>
          
          <h3>What You Can Do:</h3>
          <ul>
            <li>Create engaging social media captions</li>
            <li>Generate compelling headlines and ad copy</li>
            <li>Write video scripts and storytelling content</li>
            <li>Build carousel posts and LinkedIn content</li>
            <li>Access AI-powered content suggestions</li>
            <li>Upload files and images for context</li>
          </ul>
          
          <h3>Getting Started:</h3>
          <ol>
            <li>Click the login button below</li>
            <li>Use your credentials to sign in</li>
            <li>Change your password in settings</li>
            <li>Explore the AI assistants</li>
            <li>Start creating amazing content!</li>
          </ol>
          
          <div style="text-align: center;">
            <a href="${loginUrl}" class="cta-button">Login to Your Account</a>
          </div>
          
          <p>If you have any questions or need support during your trial, our team is here to help. Don't forget to provide feedback - your insights help us improve the platform!</p>
          
          <p>We're excited to see what you'll create with TWIQ!</p>
          
          <p>Best regards,<br>
          The TWIQ Team</p>
        </div>
        
        <div class="footer">
          <p>This invitation was sent because you were selected for TWIQ beta access.<br>
          If you believe this was sent in error, please contact our support team.</p>
          <p>Your trial expires on ${formatDate(endDate)}. Consider upgrading to continue using TWIQ after your trial period.</p>
        </div>
      </div>
    </body>
    </html>
    `
  };
};

module.exports = { userInvitationEmail };