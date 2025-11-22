const nodemailer = require('nodemailer');

exports.handler = async function(event, context) {
  // 1. Check if password is set
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error("Missing SMTP credentials");
    return { statusCode: 500, body: "Server Error: Missing email credentials." };
  }

  // 2. Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // 3. Parse the email data
  const { to, subject, text } = JSON.parse(event.body);

  // 4. Configure the "Transporter" (Gmail)
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  try {
    // 5. Send the email
    await transporter.sendMail({
      from: `"Dream Computer Solutions" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text: text.replace(/%0D%0A/g, '\n') // Fix formatting
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Email sent successfully' })
    };
  } catch (error) {
    console.error('Email Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send email', details: error.message })
    };
  }
};