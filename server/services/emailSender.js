'use strict';

const nodemailer = require('nodemailer');

let latestMockEmail = null;

function getEmailProvider() {
    if (process.env.EMAIL_PROVIDER) return process.env.EMAIL_PROVIDER.trim().toLowerCase();
    return process.env.NODE_ENV === 'production' ? 'resend' : 'mock';
}

function assertSafeHeaderValue(value, name) {
    if (typeof value !== 'string' || /[\r\n]/.test(value)) {
        throw new Error(`${name} contains invalid characters.`);
    }
}

function getEmailConfig() {
    const provider = getEmailProvider();
    const enabledValue = process.env.EMAIL_VERIFICATION_ENABLED;
    if (enabledValue !== undefined && !['true', 'false'].includes(enabledValue)) {
        throw new Error('EMAIL_VERIFICATION_ENABLED must be true or false.');
    }
    const enabled = enabledValue !== 'false';
    if (!['resend', 'smtp', 'mock'].includes(provider)) {
        throw new Error('EMAIL_PROVIDER must be resend, smtp, or mock.');
    }
    if (process.env.NODE_ENV === 'production' &&
        (enabledValue !== 'true' || !['resend', 'smtp'].includes(provider))) {
        throw new Error('Production email verification requires EMAIL_VERIFICATION_ENABLED=true and EMAIL_PROVIDER=resend or smtp.');
    }
    if (!enabled) {
        throw new Error('Email verification is disabled. Enable it rather than bypassing account verification.');
    }
    if (provider === 'resend') {
        if (!process.env.RESEND_API_KEY?.trim()) {
            throw new Error('RESEND_API_KEY is not configured.');
        }
        if (!process.env.EMAIL_FROM?.trim()) {
            throw new Error('EMAIL_FROM is not configured.');
        }
        assertSafeHeaderValue(process.env.EMAIL_FROM, 'EMAIL_FROM');
    } else if (provider === 'smtp') {
        for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM']) {
            if (!process.env[name]?.trim()) throw new Error(`${name} is not configured.`);
        }
        if (!/^\d+$/.test(process.env.SMTP_PORT || '') ||
            Number(process.env.SMTP_PORT) < 1 || Number(process.env.SMTP_PORT) > 65535) {
            throw new Error('SMTP_PORT must be an integer from 1 to 65535.');
        }
        if (!['true', 'false'].includes(process.env.SMTP_SECURE)) {
            throw new Error('SMTP_SECURE must be true or false.');
        }
        assertSafeHeaderValue(process.env.MAIL_FROM, 'MAIL_FROM');
        const senderMatch = process.env.MAIL_FROM.match(/^(?:(.*?)\s*<)?([^<>\s]+@[^<>\s]+)>?$/);
        if (!senderMatch || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderMatch[2])) {
            throw new Error('MAIL_FROM must contain a valid sender email address.');
        }
    } else if (process.env.NODE_ENV === 'production') {
        throw new Error('Mock email delivery is available only outside production.');
    }

    return {
        provider,
        enabled,
        from: (provider === 'smtp' ? process.env.MAIL_FROM : process.env.EMAIL_FROM)?.trim() || ''
    };
}

async function sendEmail(message) {
    const config = getEmailConfig();
    if (config.provider === 'mock') {
        latestMockEmail = { ...message, sentAt: new Date().toISOString() };
        return { accepted: true, provider: 'mock' };
    }

    if (config.provider === 'smtp') {
        return sendSmtpEmail(message, config.from);
    }

    let response;
    try {
        response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: config.from,
                to: [message.to],
                subject: message.subject,
                text: message.text,
                html: message.html
            }),
            signal: AbortSignal.timeout(10000),
            redirect: 'error'
        });
    } catch (error) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
            throw new Error('Email provider request timed out.');
        }
        throw new Error('Could not connect to the email provider.');
    }
    if (!response.ok) {
        throw new Error(`Resend rejected the email request (HTTP ${response.status}).`);
    }
    return { accepted: true, provider: 'resend' };
}

async function sendSmtpEmail(message, from) {
    assertSafeHeaderValue(message.to, 'Email recipient');
    assertSafeHeaderValue(message.subject, 'Email subject');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)) {
        throw new Error('Email recipient must be a valid email address.');
    }
    const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST.trim(),
        port: Number(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER.trim(),
            pass: process.env.SMTP_PASSWORD.trim()
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
    });
    try {
        await transport.sendMail({
            from,
            to: message.to,
            subject: message.subject,
            text: message.text,
            html: message.html
        });
    } catch (error) {
        if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKET') {
            throw new Error('SMTP email delivery timed out or the connection was closed.');
        }
        const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
            ? error.code
            : 'UNKNOWN';
        throw new Error(`SMTP email delivery failed (${code}).`);
    } finally {
        transport.close();
    }
    return { accepted: true, provider: 'smtp' };
}

function getLatestMockEmail() {
    return latestMockEmail;
}

function clearLatestMockEmail() {
    latestMockEmail = null;
}

module.exports = {
    clearLatestMockEmail,
    getEmailConfig,
    getEmailProvider,
    getLatestMockEmail,
    sendEmail
};
