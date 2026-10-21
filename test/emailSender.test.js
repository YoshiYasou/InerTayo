'use strict';

const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { sendEmail } = require('../server/services/emailSender');

async function run() {
    const originalFetch = global.fetch;
    const originalCreateTransport = nodemailer.createTransport;
    const envKeys = [
        'EMAIL_PROVIDER', 'RESEND_API_KEY', 'RESEND_FROM', 'SMTP_HOST', 'SMTP_PORT',
        'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_PASSWORD', 'SMTP_FROM', 'MAIL_FROM',
        'GMAIL_USER', 'GMAIL_APP_PASSWORD'
    ];
    const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));

    try {
        for (const key of envKeys) delete process.env[key];
        process.env.EMAIL_PROVIDER = 'resend';
        process.env.RESEND_API_KEY = 'test-api-key';
        process.env.RESEND_FROM = 'InerTayo <verify@example.com>';

        let request;
        global.fetch = async (url, options) => {
            request = { url, options };
            return { ok: true, status: 200 };
        };

        await sendEmail({ to: 'commuter@example.com', subject: 'Code', text: '123456' });
        assert.equal(request.url, 'https://api.resend.com/emails');
        assert.equal(request.options.headers.Authorization, 'Bearer test-api-key');
        assert.deepEqual(JSON.parse(request.options.body), {
            from: 'InerTayo <verify@example.com>',
            to: ['commuter@example.com'],
            subject: 'Code',
            text: '123456'
        });

        global.fetch = async () => ({
            ok: false,
            status: 403,
            json: async () => ({
                name: 'validation_error',
                message: 'The sender domain is not verified.'
            })
        });
        await assert.rejects(
            sendEmail({ to: 'commuter@example.com', subject: 'Code', text: '123456' }),
            /sender domain is not verified/i
        );

        delete process.env.RESEND_FROM;
        await assert.rejects(
            sendEmail({ to: 'commuter@example.com', subject: 'Code', text: '123456' }),
            /requires both RESEND_API_KEY and RESEND_FROM/
        );

        process.env.EMAIL_PROVIDER = 'smtp';
        delete process.env.RESEND_API_KEY;
        delete process.env.RESEND_FROM;
        process.env.SMTP_HOST = 'smtp.example.com';
        process.env.SMTP_PORT = '587';
        process.env.SMTP_SECURE = 'false';
        process.env.SMTP_USER = 'sender@example.com';
        process.env.SMTP_PASSWORD = 'smtp-test-password';
        process.env.MAIL_FROM = 'InerTayo <sender@example.com>';
        process.env.GMAIL_USER = 'gmail@example.com';
        process.env.GMAIL_APP_PASSWORD = 'gmail-test-password';

        let smtpTransportOptions;
        let sentMessage;
        let smtpTransportCount = 0;
        let closedTransportCount = 0;
        nodemailer.createTransport = options => {
            smtpTransportOptions = options;
            smtpTransportCount += 1;
            return {
                sendMail: async message => { sentMessage = message; },
                close: () => { closedTransportCount += 1; }
            };
        };
        await sendEmail({ to: 'commuter@example.com', subject: 'Code', text: '123456' });
        assert.equal(smtpTransportOptions.host, 'smtp.example.com');
        assert.equal(smtpTransportOptions.port, 587);
        assert.equal(smtpTransportOptions.secure, false);
        assert.deepEqual(smtpTransportOptions.auth, { user: 'sender@example.com', pass: 'smtp-test-password' });
        assert.equal(smtpTransportOptions.pool, true);
        assert.equal(smtpTransportOptions.maxConnections, 2);
        assert.equal(sentMessage.from, 'InerTayo <sender@example.com>');
        assert.equal(sentMessage.to, 'commuter@example.com');

        await sendEmail({ to: 'commuter@example.com', subject: 'Code', text: '123456' });
        assert.equal(smtpTransportCount, 1, 'SMTP transporter is reused while configuration is unchanged');

        process.env.SMTP_PORT = '465';
        delete process.env.SMTP_SECURE;
        await sendEmail({ to: 'commuter@example.com', subject: 'Code', text: '123456' });
        assert.equal(smtpTransportOptions.secure, true);
        assert.equal(smtpTransportCount, 2, 'SMTP transporter is recreated when configuration changes');
        assert.equal(closedTransportCount, 1, 'Previous SMTP connection pool is closed when configuration changes');

        console.log('Email sender tests passed.');
    } finally {
        global.fetch = originalFetch;
        nodemailer.createTransport = originalCreateTransport;
        for (const key of envKeys) {
            if (originalEnv[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnv[key];
        }
    }
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});