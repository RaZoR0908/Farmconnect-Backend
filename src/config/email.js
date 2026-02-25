const nodemailer = require('nodemailer');

// Create Brevo SMTP transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.BREVO_SMTP_USER || process.env.BREVO_FROM_EMAIL,
      pass: process.env.BREVO_API_KEY,
    },
  });
};

// Send password reset email
const sendPasswordResetEmail = async (email, resetCode, userName) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `FarmConnect <${process.env.BREVO_FROM_EMAIL || 'noreply@farmconnect.com'}>`,
      to: email,
      subject: 'Reset Your FarmConnect Password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2e7d32; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .code-box { background-color: #fff; border: 2px dashed #2e7d32; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px; }
            .code { font-size: 32px; font-weight: bold; color: #2e7d32; letter-spacing: 5px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .warning { color: #d32f2f; font-size: 14px; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🌾 FarmConnect</h1>
            </div>
            <div class="content">
              <h2>Hello ${userName || 'User'},</h2>
              <p>We received a request to reset your password. Use the code below to reset your password:</p>
              
              <div class="code-box">
                <div class="code">${resetCode}</div>
              </div>
              
              <p><strong>This code will expire in 15 minutes.</strong></p>
              
              <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
              
              <div class="warning">
                ⚠️ Never share this code with anyone. FarmConnect will never ask for your code.
              </div>
            </div>
            <div class="footer">
              <p>&copy; 2026 FarmConnect. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hello ${userName || 'User'},

We received a request to reset your FarmConnect password.

Your password reset code is: ${resetCode}

This code will expire in 15 minutes.

If you didn't request a password reset, please ignore this email.

Never share this code with anyone.

- FarmConnect Team`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Password reset email sent via Brevo SMTP');
    console.log('   Message ID:', info.messageId);
    console.log('   From:', mailOptions.from);
    console.log('   To:', email);
    console.log('   Response:', info.response);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    console.error('   Error details:', error.response || error.message);
    return { success: false, error: error.response?.body?.message || error.message };
  }
};

module.exports = {
  sendPasswordResetEmail,
};
