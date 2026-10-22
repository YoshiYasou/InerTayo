'use strict';

const nodemailer = require('nodemailer');

let smtpTransporter;
let smtpTransporterConfig;

function getSmtpTransporter(config) {
    const configKey = JSON.stringify(config);
    if (smtpTransporter && smtpTransporterConfig !== configKey) {
        smtpTransporter.close();
        smtpTransporter = null;
    }
    if (!smtpTransporter) {
        smtpTransporter = nodemailer.createTransport({
            ...config,
            pool: true,
            maxConnections: 2,
            maxMessages: 100,
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 20000
        });
        smtpTransporterConfig = configKey;
    }
    return smtpTransporter;
}

async function sendEmail({ to, subject, text }) {
    const smtpHost = process.env.SMTP_HOST?.trim();
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPassword = process.env.SMTP_PASS;
    let config;
    let from;

    if (smtpHost) {
        const port = Number(process.env.SMTP_PORT || 587);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error('SMTP_PORT must be a valid port number.');
        }

        const secureSetting = process.env.SMTP_SECURE?.trim().toLowerCase();
        if (secureSetting && !['true', 'false'].includes(secureSetting)) {
            throw new Error('SMTP_SECURE must be set to true or false.');
        }
        if (Boolean(smtpUser) !== Boolean(smtpPassword)) {
            throw new Error('SMTP_USER and SMTP_PASS must both be configured for authenticated SMTP.');
        }

        from = process.env.SMTP_FROM?.trim() || (smtpUser ? `InerTayo <${smtpUser}>` : '');
        if (!from) {
            throw new Error('SMTP_FROM is required when SMTP authentication is disabled.');
        }

        config = {
            host: smtpHost,
            port,
            secure: secureSetting ? secureSetting === 'true' : port === 465
        };
        if (smtpUser) config.auth = { user: smtpUser, pass: smtpPassword };
    } else {
        const hasSmtpSettings = ['SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']
            .some(key => process.env[key]);
        if (hasSmtpSettings) {
            throw new Error('SMTP_HOST is required when using SMTP settings.');
        }

        const user = process.env.GMAIL_USER?.trim();
        const password = process.env.GMAIL_APP_PASSWORD;
        if (!user || !password) {
            throw new Error('Configure SMTP_HOST, SMTP_FROM, and SMTP credentials, or set GMAIL_USER and GMAIL_APP_PASSWORD.');
        }

        config = {
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user, pass: password }
        };
        from = `InerTayo <${user}>`;
    }

    const transporter = getSmtpTransporter(config);

    await transporter.sendMail({
        from,
        to,
        subject,
        text
    });
}

module.exports = { sendEmail };
