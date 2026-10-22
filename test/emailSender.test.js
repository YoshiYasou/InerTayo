'use strict';

const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { sendEmail } = require('../server/services/emailSender');

async function run() {
    const originalCreateTransport = nodemailer.createTransport;
    const envKeys = [
        'EMAIL_PROVIDER',
        'GMAIL_USER',
        'GMAIL_APP_PASSWORD',
        'SMTP_HOST',
        'SMTP_PORT',
        'SMTP_SECURE',
        'SMTP_USER',
        'SMTP_PASS',
        'SMTP_FROM'
    ];
    const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
    try {
        process.env.EMAIL_PROVIDER = 'smtp';
        process.env.GMAIL_USER = 'sender@example.com';
        process.env.GMAIL_APP_PASSWORD = 'test-app-password';
        for (const key of envKeys.filter(key => key.startsWith('SMTP_'))) delete process.env[key];

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

        process.env.SMTP_HOST = 'smtp.example.com';
        process.env.SMTP_PORT = '587';
        process.env.SMTP_USER = 'smtp-user';
        process.env.SMTP_PASS = 'smtp-password';
        process.env.SMTP_FROM = 'InerTayo <no-reply@example.com>';
        await sendEmail({ to: 'user@example.com', subject: 'Verify', text: '123456' });
        assert.equal(transportOptions.host, 'smtp.example.com');
        assert.equal(transportOptions.port, 587);
        assert.equal(transportOptions.secure, false);
        assert.deepEqual(transportOptions.auth, { user: 'smtp-user', pass: 'smtp-password' });
        assert.equal(sentMessage.from, 'InerTayo <no-reply@example.com>');
        assert.equal(transportCount, 3, 'Generic SMTP settings replace the Gmail transporter');

        process.env.SMTP_PORT = '465';
        await sendEmail({ to: 'user@example.com', subject: 'Verify', text: '654321' });
        assert.equal(transportOptions.secure, true, 'Port 465 enables secure SMTP by default');
        assert.equal(transportCount, 4, 'Transporter is recreated when SMTP configuration changes');

        process.env.SMTP_PORT = 'not-a-port';
        await assert.rejects(
            sendEmail({ to: 'user@example.com', subject: 'Verify', text: '123456' }),
            /SMTP_PORT must be a valid port number/
        );

        for (const key of envKeys.filter(key => key.startsWith('SMTP_'))) delete process.env[key];
        delete process.env.GMAIL_USER;
        await assert.rejects(
            sendEmail({ to: 'admin@example.com', subject: 'Code', text: '123456' }),
            /Configure SMTP_HOST/
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
