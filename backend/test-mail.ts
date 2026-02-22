import nodemailer from 'nodemailer';

const SMTP_HOST = 'connect.smtp.bz';
const SMTP_USER = 'no-reply@staff-altaimai.com';
const SMTP_PASS = 'testpass2026';
const TO = 'azamattolegenov1@gmail.com';

const ports = [
  { port: 587, secure: false, label: 'TLS/STARTTLS' },
  { port: 2525, secure: false, label: 'Standard' },
  { port: 465, secure: true, label: 'SSL' },
];

async function tryPort(config: typeof ports[0]) {
  console.log(`\n--- Trying ${config.label} port ${config.port} ---`);

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: config.port,
    secure: config.secure,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
  });

  try {
    await transporter.verify();
    console.log(`Port ${config.port}: Connection OK`);
  } catch (err: any) {
    console.error(`Port ${config.port}: Connection FAILED — ${err.message}`);
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: `"Staff AltaimAI" <${SMTP_USER}>`,
      to: TO,
      subject: 'Тестовое письмо — Staff AltaimAI',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a56db;">Staff AltaimAI</h2>
          <p>Здравствуйте!</p>
          <p>Это тестовое письмо для проверки почтового сервиса.</p>
          <p>Если вы видите это сообщение — SMTP работает корректно.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #6b7280; font-size: 12px;">
            Отправлено через ${SMTP_HOST}:${config.port} (${config.label})
          </p>
        </div>
      `,
    });

    console.log(`Port ${config.port}: Email SENT!`);
    console.log('  Message ID:', info.messageId);
    console.log('  Response:', info.response);
    return true;
  } catch (err: any) {
    console.error(`Port ${config.port}: Send FAILED — ${err.message}`);
    return false;
  }
}

async function main() {
  for (const config of ports) {
    const success = await tryPort(config);
    if (success) {
      console.log(`\n=== SUCCESS on port ${config.port} (${config.label}) ===`);
      process.exit(0);
    }
  }
  console.log('\n=== ALL PORTS FAILED ===');
  process.exit(1);
}

main();
