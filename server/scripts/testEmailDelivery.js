'use strict';

require('dotenv').config();
const { getApplicationUrl } = require('../services/emailVerification');
const { getEmailConfig, sendEmail } = require('../services/emailSender');

async function run() {
    const recipient = process.argv[2]?.trim();
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
        throw new Error('Provide exactly one test recipient: npm run email:test -- recipient@example.com');
    }
    const config = getEmailConfig();
    if (!['resend', 'smtp'].includes(config.provider)) {
        throw new Error('A delivery test requires EMAIL_PROVIDER=resend or smtp; use the local mock preview for development.');
    }
    getApplicationUrl();
    await sendEmail({
        to: recipient,
        subject: 'InerTayo email delivery test',
        text: 'This is a single test message from the configured InerTayo email service.'
    });
    console.log(`${config.provider} accepted one test message. This does not confirm inbox delivery.`);
}

run().catch(error => {
    console.error(`Email delivery test failed: ${error.message}`);
    process.exitCode = 1;
});
