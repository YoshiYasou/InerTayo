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
    const user = process.env.GMAIL_USER?.trim();
    const password = process.env.GMAIL_APP_PASSWORD;
    if (!user || !password) {
        throw new Error('Gmail delivery requires GMAIL_USER and GMAIL_APP_PASSWORD.');
    }

    const transporter = getSmtpTransporter({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user, pass: password }
    });

    await transporter.sendMail({
        from: `InerTayo <${user}>`,
        to,
        subject,
        text
    });
}

module.exports = { sendEmail };
