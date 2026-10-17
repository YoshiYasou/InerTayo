'use strict';

const nodemailer = require('nodemailer');

async function sendEmail({ to, subject, text }) {
    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const resendFrom = process.env.RESEND_FROM?.trim();

    if (resendApiKey || resendFrom) {
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
            console.error(`[AUTH] Resend email request failed with HTTP ${response.status}.`);
            throw new Error('The email provider rejected the message.');
        }
        return;
    }

    const hasGmail = Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
    const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    if (!hasGmail && !hasSmtp) {
        throw new Error('Email delivery is not configured.');
    }

    const transporter = hasGmail
        ? nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
        })
        : nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        });
    const from = hasGmail
        ? `InerTayo <${process.env.GMAIL_USER}>`
        : (process.env.SMTP_FROM || `InerTayo <${process.env.SMTP_USER}>`);

    await transporter.sendMail({ from, to, subject, text });
}

module.exports = { sendEmail };