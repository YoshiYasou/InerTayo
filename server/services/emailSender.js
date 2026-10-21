'use strict';

const nodemailer = require('nodemailer');

async function sendEmail({ to, subject, text }) {
    const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const resendFrom = process.env.RESEND_FROM?.trim();
    const smtpHost = process.env.SMTP_HOST?.trim();
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
    const smtpFrom = process.env.SMTP_FROM?.trim() || process.env.MAIL_FROM?.trim();
    const hasSmtp = Boolean(smtpHost && smtpUser && smtpPass);
    const hasGmail = Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

    if (provider && !['resend', 'smtp', 'gmail'].includes(provider)) {
        throw new Error(`Unsupported EMAIL_PROVIDER "${provider}". Use "smtp", "gmail", or "resend".`);
    }

    if (provider === 'resend' || (!provider && (resendApiKey || resendFrom))) {
        if (!resendApiKey || !resendFrom) {
            throw new Error('Resend requires both RESEND_API_KEY and RESEND_FROM.');
        }

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ from: resendFrom, to: [to], subject, text })
        });

        if (!response.ok) {
            let providerError = {};
            try {
                providerError = await response.json();
            } catch {
                providerError = {};
            }
            const providerMessage = typeof providerError.message === 'string'
                ? providerError.message.slice(0, 400)
                : 'No error detail returned by provider.';
            const providerCode = typeof providerError.name === 'string'
                ? providerError.name.slice(0, 80)
                : 'unknown_error';
            const diagnostic = `HTTP ${response.status} (${providerCode}): ${providerMessage}`;
            console.error(`[AUTH] Resend rejected email: ${diagnostic}`);
            throw new Error(`Resend rejected the email: ${diagnostic}`);
        }
        return;
    }

    if (provider === 'smtp' && !hasSmtp) {
        throw new Error('SMTP requires SMTP_HOST, SMTP_USER, and SMTP_PASS (or SMTP_PASSWORD).');
    }
    if (provider === 'gmail' && !hasGmail) {
        throw new Error('Gmail requires GMAIL_USER and GMAIL_APP_PASSWORD.');
    }
    if (!hasGmail && !hasSmtp) {
        throw new Error('Email delivery is not configured.');
    }

    const useGmail = provider === 'gmail' || (!provider && hasGmail && !hasSmtp);
    const port = useGmail ? 465 : (Number(process.env.SMTP_PORT) || 587);
    const secureSetting = process.env.SMTP_SECURE?.trim().toLowerCase();
    const secure = useGmail || (secureSetting
        ? secureSetting === 'true'
        : port === 465);
    const transporter = useGmail
        ? nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
        })
        : nodemailer.createTransport({
            host: smtpHost,
            port,
            secure,
            auth: { user: smtpUser, pass: smtpPass }
        });
    const from = useGmail
        ? `InerTayo <${process.env.GMAIL_USER}>`
        : (smtpFrom || `InerTayo <${smtpUser}>`);

    await transporter.sendMail({ from, to, subject, text });
}

module.exports = { sendEmail };