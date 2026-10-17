'use strict';

const assert = require('node:assert/strict');
const { sendEmail } = require('../server/services/emailSender');

async function run() {
    const originalFetch = global.fetch;
    const originalApiKey = process.env.RESEND_API_KEY;
    const originalFrom = process.env.RESEND_FROM;
    const originalSmtpHost = process.env.SMTP_HOST;
    const originalSmtpUser = process.env.SMTP_USER;
    const originalSmtpPass = process.env.SMTP_PASS;

    try {
        process.env.RESEND_API_KEY = 'test-api-key';
        process.env.RESEND_FROM = 'InerTayo <verify@example.com>';
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASS;

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

        global.fetch = async () => ({ ok: false, status: 401 });
        await assert.rejects(
            sendEmail({ to: 'commuter@example.com', subject: 'Code', text: '123456' }),
            /email provider rejected/i
        );

        delete process.env.RESEND_FROM;
        await assert.rejects(
            sendEmail({ to: 'commuter@example.com', subject: 'Code', text: '123456' }),
            /requires both RESEND_API_KEY and RESEND_FROM/
        );

        console.log('Email sender tests passed.');
    } finally {
        global.fetch = originalFetch;
        if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
        else process.env.RESEND_API_KEY = originalApiKey;
        if (originalFrom === undefined) delete process.env.RESEND_FROM;
        else process.env.RESEND_FROM = originalFrom;
        if (originalSmtpHost === undefined) delete process.env.SMTP_HOST;
        else process.env.SMTP_HOST = originalSmtpHost;
        if (originalSmtpUser === undefined) delete process.env.SMTP_USER;
        else process.env.SMTP_USER = originalSmtpUser;
        if (originalSmtpPass === undefined) delete process.env.SMTP_PASS;
        else process.env.SMTP_PASS = originalSmtpPass;
    }
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});