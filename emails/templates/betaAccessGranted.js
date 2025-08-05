const betaAccessGrantedEmail = ({ userName, betaPlan, endDate, loginUrl }) => {
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long', 
      day: 'numeric'
    });
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to TWIQ Beta!</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .plan-badge { display: inline-block; background: #4CAF50; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; margin: 10px 0; }
        .cta-button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        .highlight { background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Welcome to TWIQ Beta!</h1>
          <p>You've been granted exclusive beta access</p>
        </div>
        
        <div class="content">
          <h2>Hi ${userName},</h2>
          
          <p>Great news! You've been selected for our beta program and granted access to our platform.</p>
          
          <div class="highlight">
            <strong>Your Beta Access Details:</strong><br>
            <span class="plan-badge">${betaPlan} Plan</span><br>
            <strong>Access until:</strong> ${formatDate(endDate)}
          </div>
          
          <p>During your beta period, you'll have full access to all features included in the ${betaPlan} plan. This is a great opportunity to explore our platform and provide valuable feedback.</p>
          
          <h3>What's Next?</h3>
          <ul>
            <li>Log in to your account and start exploring</li>
            <li>Try out all the available AI assistants</li>
            <li>Share your feedback with our team</li>
            <li>Consider upgrading to a paid plan before your beta expires</li>
          </ul>
          
          <div style="text-align: center;">
            <a href="${loginUrl}" class="cta-button">Access Your Account</a>
          </div>
          
          <p>If you have any questions or need support, don't hesitate to reach out to our team.</p>
          
          <p>Happy creating!<br>
          The TWIQ Team</p>
        </div>
        
        <div class="footer">
          <p>This email was sent because you were granted beta access to TWIQ.<br>
          If you believe this was sent in error, please contact support.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

module.exports = { betaAccessGrantedEmail };