'use strict';

const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const {
    clearLatestMockEmail,
    getEmailConfig,
    getLatestMockEmail,
    sendEmail
} = require('../server/services/emailSender');

async function run() {
    const originalFetch = global.fetch;
    const originalCreateTransport = nodemailer.createTransport;
    const envNames = [
        'NODE_ENV',
        'EMAIL_VERIFICATION_ENABLED',
        'EMAIL_PROVIDER',
        'RESEND_API_KEY',
        'EMAIL_FROM',
        'SMTP_HOST',
        'SMTP_PORT',
        'SMTP_SECURE',
        'SMTP_USER',
        'SMTP_PASSWORD',
        'MAIL_FROM'
    ];
    const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));

    try {
        process.env.NODE_ENV = 'development';
        process.env.EMAIL_VERIFICATION_ENABLED = 'true';
        process.env.EMAIL_PROVIDER = 'resend';
        process.env.RESEND_API_KEY = 'test-resend-key';
        process.env.EMAIL_FROM = 'InerTayo <verified@example.test>';

        const requests = [];
        global.fetch = async (url, options) => {
            requests.push({ url, options });
            return { ok: true, status: 200 };
        };
        const message = {
            to: 'commuter@example.test',
            subject: 'Verify Your Email',
            text: 'Please verify.',
            html: '<p>Please verify.</p>'
        };
        const resendResult = await sendEmail(message);
        assert.deepEqual(resendResult, { accepted: true, provider: 'resend' });
        assert.equal(requests[0].url, 'https://api.resend.com/emails');
        assert.equal(requests[0].options.method, 'POST');
        assert.equal(requests[0].options.redirect, 'error');
        assert.match(requests[0].options.headers.Authorization, /^Bearer test-resend-key$/);
        assert.deepEqual(JSON.parse(requests[0].options.body), {
            from: 'InerTayo <verified@example.test>',
            to: ['commuter@example.test'],
            subject: 'Verify Your Email',
            text: 'Please verify.',
            html: '<p>Please verify.</p>'
        });

        global.fetch = async () => ({ ok: false, status: 403, json: async () => ({ message: 'private response' }) });
        await assert.rejects(
            sendEmail(message),
            error => error.message.includes('HTTP 403') && !error.message.includes('private response')
        );

        global.fetch = async () => {
            throw new Error('network failure containing private details');
        };
        await assert.rejects(
            sendEmail(message),
            error => error.message === 'Could not connect to the email provider.'
        );

        process.env.EMAIL_PROVIDER = 'mock';
        clearLatestMockEmail();
        const mockResult = await sendEmail(message);
        assert.deepEqual(mockResult, { accepted: true, provider: 'mock' });
        assert.equal(getLatestMockEmail().to, message.to);
        assert.equal(getLatestMockEmail().html, message.html);

        process.env.NODE_ENV = 'production';
        assert.throws(
            () => getEmailConfig(),
            /EMAIL_VERIFICATION_ENABLED=true and EMAIL_PROVIDER=resend or smtp/
        );
        await assert.rejects(sendEmail(message), /EMAIL_VERIFICATION_ENABLED=true and EMAIL_PROVIDER=resend or smtp/);

        process.env.EMAIL_PROVIDER = 'resend';
        delete process.env.RESEND_API_KEY;
        assert.throws(() => getEmailConfig(), /RESEND_API_KEY is not configured/);

        process.env.RESEND_API_KEY = 'test-resend-key';
        delete process.env.EMAIL_VERIFICATION_ENABLED;
        assert.throws(
            () => getEmailConfig(),
            /EMAIL_VERIFICATION_ENABLED=true and EMAIL_PROVIDER=resend or smtp/
        );

        process.env.NODE_ENV = 'development';
        process.env.EMAIL_VERIFICATION_ENABLED = 'false';
        assert.throws(() => getEmailConfig(), /Email verification is disabled/);
        process.env.EMAIL_VERIFICATION_ENABLED = 'true';
        process.env.EMAIL_PROVIDER = 'unknown';
        assert.throws(() => getEmailConfig(), /EMAIL_PROVIDER must be resend, smtp, or mock/);

        process.env.EMAIL_PROVIDER = 'smtp';
        process.env.SMTP_HOST = 'smtp.gmail.com';
        process.env.SMTP_PORT = '587';
        process.env.SMTP_SECURE = 'false';
        process.env.SMTP_USER = 'sender@gmail.com';
        process.env.SMTP_PASSWORD = 'test-app-password';
        process.env.MAIL_FROM = 'InerTayo <sender@gmail.com>';

        const transports = [];
        nodemailer.createTransport = options => {
            const transport = {
                closeCalled: false,
                async sendMail(outgoingMessage) {
                    transport.message = outgoingMessage;
                    return { messageId: 'test-message-id' };
                },
                close() {
                    transport.closeCalled = true;
                }
            };
            transports.push({ options, transport });
            return transport;
        };

        process.env.NODE_ENV = 'production';
        assert.deepEqual(getEmailConfig(), {
            provider: 'smtp',
            enabled: true,
            from: 'InerTayo <sender@gmail.com>'
        });
        const smtpResult = await sendEmail(message);
        assert.deepEqual(smtpResult, { accepted: true, provider: 'smtp' });
        assert.deepEqual(transports[0].options, {
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: { user: 'sender@gmail.com', pass: 'test-app-password' },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 10000
        });
        assert.deepEqual(transports[0].transport.message, {
            from: 'InerTayo <sender@gmail.com>',
            to: message.to,
            subject: message.subject,
            text: message.text,
            html: message.html
        });
        assert.equal(transports[0].transport.closeCalled, true);

        nodemailer.createTransport = () => ({
            async sendMail() {
                const error = new Error('private SMTP response');
                error.code = 'EAUTH';
                throw error;
            },
            close() {}
        });
        await assert.rejects(
            sendEmail(message),
            error => error.message === 'SMTP email delivery failed (EAUTH).' &&
                !error.message.includes('private SMTP response')
        );

        process.env.SMTP_PORT = '70000';
        assert.throws(() => getEmailConfig(), /SMTP_PORT must be an integer/);
        process.env.SMTP_PORT = '587';
        process.env.SMTP_SECURE = 'no';
        assert.throws(() => getEmailConfig(), /SMTP_SECURE must be true or false/);
        process.env.SMTP_SECURE = 'false';
        process.env.MAIL_FROM = 'sender@example.com\r\nBcc: attacker@example.com';
        assert.throws(() => getEmailConfig(), /MAIL_FROM contains invalid characters/);

        console.log('Resend, SMTP, and development mock sender tests passed.');
    } finally {
        global.fetch = originalFetch;
        nodemailer.createTransport = originalCreateTransport;
        clearLatestMockEmail();
        for (const name of envNames) {
            if (originalEnv[name] === undefined) delete process.env[name];
            else process.env[name] = originalEnv[name];
        }
    }
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
