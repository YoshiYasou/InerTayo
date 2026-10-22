'use strict';

const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { sendEmail } = require('../server/services/emailSender');

async function run() {
    const originalCreateTransport = nodemailer.createTransport;
    const envKeys = ['EMAIL_PROVIDER', 'GMAIL_USER', 'GMAIL_APP_PASSWORD'];
    const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));

    try {
        process.env.EMAIL_PROVIDER = 'smtp';
        process.env.GMAIL_USER = 'sender@example.com';
        process.env.GMAIL_APP_PASSWORD = 'test-app-password';

        let transportOptions;
        let sentMessage;
        let transportCount = 0;
        let closedTransportCount = 0;
        nodemailer.createTransport = options => {
            transportOptions = options;
            transportCount += 1;
            return {
                sendMail: async message => { sentMessage = message; },
                close: () => { closedTransportCount += 1; }
            };
        };

        await sendEmail({ to: 'admin@example.com', subject: 'Code', text: '123456' });
        assert.equal(transportOptions.host, 'smtp.gmail.com');
        assert.equal(transportOptions.port, 465);
        assert.equal(transportOptions.secure, true);
        assert.deepEqual(transportOptions.auth, {
            user: 'sender@example.com',
            pass: 'test-app-password'
        });
        assert.equal(transportOptions.pool, true);
        assert.equal(transportOptions.maxConnections, 2);
        assert.equal(sentMessage.from, 'InerTayo <sender@example.com>');
        assert.equal(sentMessage.to, 'admin@example.com');

        await sendEmail({ to: 'admin@example.com', subject: 'Code', text: '654321' });
        assert.equal(transportCount, 1, 'Gmail transporter is reused');

        process.env.GMAIL_USER = 'another-sender@example.com';
        await sendEmail({ to: 'admin@example.com', subject: 'Code', text: '987654' });
        assert.equal(transportCount, 2, 'Transporter is recreated when Gmail credentials change');
        assert.equal(closedTransportCount, 1, 'Previous transporter is closed on credential change');

        delete process.env.GMAIL_USER;
        await assert.rejects(
            sendEmail({ to: 'admin@example.com', subject: 'Code', text: '123456' }),
            /requires GMAIL_USER and GMAIL_APP_PASSWORD/
        );

        console.log('Email sender tests passed.');
    } finally {
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
