const confirmEmailTemplate = ({ name, confirmationUrl }) => {
  return {
    subject: "Confirm your Twiq account",
    html: `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Confirm your TWIQ account</title>
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        color: #1e1e1e;
        background-color: #ffffff;
        margin: 0;
        padding: 0;
      }
      .container {
        max-width: 600px;
        margin: 40px auto;
        padding: 20px;
        border: 1px solid #e5e5e5;
        border-radius: 8px;
        background-color: #fafafa;
      }
      .header {
        text-align: center;
        margin-bottom: 30px;
      }
      .logo-text {
        font-size: 36px;
        font-weight: 900;
        color: #7f0000;
        letter-spacing: 2px;
      }
      .footer {
        font-size: 12px;
        color: #777;
        text-align: center;
        margin-top: 40px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div class="logo-text">T.W.I.Q</div>
        <h2>Confirm Your Email</h2>
      </div>
      <p>Hello ${name}, 👋</p>
      <p>Thanks for signing up for <strong>TWIQ</strong> — the AI platform for bold, brilliant content!</p>
      <p>Please confirm your email address by clicking the button below:</p>

      <p style="text-align:center;">
        <a 
          href="${confirmationUrl}" 
          style="
            display:inline-block;
            margin:20px 0;
            padding:12px 24px;
            font-size:16px;
            font-weight:bold;
            text-decoration:none;
            background-color:#7f0000;
            color:#ffffff !important;
            border-radius:5px;
          "
        >
          Confirm Your Email
        </a>
      </p>

      <p>If you didn’t request this, you can safely ignore this email.</p>

      <div class="footer">
        Copyright © 2025, TWIQ METHOD™ All Rights Reserved ICY COACHING & CONSULTING<br />
        <a href="https://app.twiq.ai" target="_blank" style="color: #7f0000;">twiq.ai</a>
      </div>
    </div>
  </body>
</html>
    `,
  };
};

module.exports = confirmEmailTemplate;
