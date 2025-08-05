const betaExpirationWarningEmail = ({ userName, betaPlan, endDate, daysRemaining, upgradeUrl }) => {
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long', 
      day: 'numeric'
    });
  };

  const getUrgencyColor = (days) => {
    if (days <= 1) return '#dc3545'; // Red
    if (days <= 3) return '#fd7e14'; // Orange  
    return '#ffc107'; // Yellow
  };

  const getUrgencyMessage = (days) => {
    if (days <= 1) return 'Your beta access expires tomorrow!';
    if (days <= 3) return `Your beta access expires in ${days} days`;
    return `Your beta access expires in ${days} days`;
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>TWIQ Beta Expiring Soon</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${getUrgencyColor(daysRemaining)}; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .countdown { background: white; border: 2px solid ${getUrgencyColor(daysRemaining)}; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; }
        .countdown-number { font-size: 48px; font-weight: bold; color: ${getUrgencyColor(daysRemaining)}; }
        .cta-button { display: inline-block; background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; font-size: 16px; }
        .plan-info { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⏰ ${getUrgencyMessage(daysRemaining)}</h1>
          <p>Don't lose access to your favorite AI tools</p>
        </div>
        
        <div class="content">
          <h2>Hi ${userName},</h2>
          
          <p>This is a friendly reminder that your TWIQ beta access is ending soon.</p>
          
          <div class="countdown">
            <div class="countdown-number">${daysRemaining}</div>
            <div>day${daysRemaining !== 1 ? 's' : ''} remaining</div>
          </div>
          
          <div class="plan-info">
            <strong>Current Beta Plan:</strong> ${betaPlan}<br>
            <strong>Access ends:</strong> ${formatDate(endDate)}
          </div>
          
          <p>You've been enjoying the ${betaPlan} plan during your beta period. To continue using TWIQ without interruption, we encourage you to upgrade to a paid subscription.</p>
          
          <h3>Why upgrade now?</h3>
          <ul>
            <li>✅ Uninterrupted access to all AI assistants</li>
            <li>✅ Keep your existing conversations and files</li>
            <li>✅ Priority customer support</li>
            <li>✅ New features and improvements</li>
          </ul>
          
          <div style="text-align: center;">
            <a href="${upgradeUrl}" class="cta-button">Upgrade Now</a>
          </div>
          
          <p><strong>What happens if I don't upgrade?</strong><br>
          After ${formatDate(endDate)}, your account will be deactivated and you'll lose access to the platform. However, your data will be safely stored for 30 days, giving you time to upgrade later if needed.</p>
          
          <p>Thank you for being part of our beta program. Your feedback has been invaluable!</p>
          
          <p>Best regards,<br>
          The TWIQ Team</p>
        </div>
        
        <div class="footer">
          <p>Questions? Contact our support team - we're here to help!</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

module.exports = { betaExpirationWarningEmail };