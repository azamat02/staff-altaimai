import nodemailer from 'nodemailer';

const smtpPort = parseInt(process.env.SMTP_PORT || '2525');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'connect.smtp.bz',
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: process.env.SMTP_USER || 'no-reply@staff-altaimai.com',
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@example.com';
const PLATFORM_URL = process.env.PLATFORM_URL || 'https://staff-altaimai.com';

function emailLayout(content: string): string {
  return `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 32px 40px; border-radius: 16px 16px 0 0; text-align: center;">
              <img src="${PLATFORM_URL}/logo-email.png" alt="Staff Altaimai" width="158" height="48" style="width: 158px; height: 48px; display: inline-block;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 40px; border-radius: 0 0 16px 16px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 8px; color: #94a3b8; font-size: 13px;">
                Это автоматическое сообщение от платформы Staff Altaimai.
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 13px;">
                &copy; ${new Date().getFullYear()} Staff Altaimai. Все права защищены.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendCredentialsEmail(
  to: string,
  fullName: string,
  login: string,
  password: string,
): Promise<void> {
  const content = `
    <h2 style="margin: 0 0 8px; color: #0f172a; font-size: 22px; font-weight: 600;">
      Добро пожаловать!
    </h2>
    <p style="margin: 0 0 24px; color: #64748b; font-size: 15px; line-height: 1.5;">
      Здравствуйте, <strong style="color: #0f172a;">${fullName}</strong>! Для вас создана учётная запись на платформе Staff Altaimai.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px;">
      <tr>
        <td style="padding: 20px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                <span style="color: #64748b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Логин</span>
                <br/>
                <span style="color: #0f172a; font-size: 16px; font-weight: 600;">${login}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 0 4px;">
                <span style="color: #64748b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Пароль</span>
                <br/>
                <code style="display: inline-block; margin-top: 4px; background: #e2e8f0; color: #0f172a; padding: 6px 12px; border-radius: 6px; font-size: 16px; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 1px;">${password}</code>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding-bottom: 24px;">
          <a href="${PLATFORM_URL}" style="display: inline-block; background: linear-gradient(135deg, #d4a017 0%, #b8860b 100%); color: #0f172a; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-size: 15px; font-weight: 600; box-shadow: 0 2px 8px rgba(212, 160, 23, 0.3);">
            Войти в платформу
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 0; color: #94a3b8; font-size: 13px; text-align: center;">
      Рекомендуем сменить пароль после первого входа.
    </p>`;

  await transporter.sendMail({
    from: `"Staff Altaimai" <${FROM}>`,
    to,
    subject: 'Ваши данные для входа в Staff Altaimai',
    html: emailLayout(content),
  });
}

export async function sendPasswordResetEmail(
  to: string,
  fullName: string,
  login: string,
  password: string,
): Promise<void> {
  const content = `
    <h2 style="margin: 0 0 8px; color: #0f172a; font-size: 22px; font-weight: 600;">
      Сброс пароля
    </h2>
    <p style="margin: 0 0 24px; color: #64748b; font-size: 15px; line-height: 1.5;">
      Здравствуйте, <strong style="color: #0f172a;">${fullName}</strong>! Ваш пароль был сброшен. Используйте данные ниже для входа:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px;">
      <tr>
        <td style="padding: 20px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                <span style="color: #64748b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Логин</span>
                <br/>
                <span style="color: #0f172a; font-size: 16px; font-weight: 600;">${login}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 0 4px;">
                <span style="color: #64748b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Новый пароль</span>
                <br/>
                <code style="display: inline-block; margin-top: 4px; background: #e2e8f0; color: #0f172a; padding: 6px 12px; border-radius: 6px; font-size: 16px; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 1px;">${password}</code>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding-bottom: 24px;">
          <a href="${PLATFORM_URL}" style="display: inline-block; background: linear-gradient(135deg, #d4a017 0%, #b8860b 100%); color: #0f172a; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-size: 15px; font-weight: 600; box-shadow: 0 2px 8px rgba(212, 160, 23, 0.3);">
            Войти в платформу
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 0; color: #94a3b8; font-size: 13px; text-align: center;">
      Рекомендуем сменить пароль после входа.
    </p>`;

  await transporter.sendMail({
    from: `"Staff Altaimai" <${FROM}>`,
    to,
    subject: 'Новый пароль для Staff Altaimai',
    html: emailLayout(content),
  });
}
