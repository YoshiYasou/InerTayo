'use strict';

require('dotenv').config();
const { getApplicationUrl } = require('../services/emailVerification');
const { getEmailConfig } = require('../services/emailSender');
const { getVerificationLimits } = require('../services/emailVerificationLimits');

try {
    const config = getEmailConfig();
    const appUrl = getApplicationUrl();
    getVerificationLimits();
    console.log(`Email verification is configured with ${config.provider} delivery for ${appUrl}.`);
} catch (error) {
    console.error(`Email configuration check failed: ${error.message}`);
    process.exitCode = 1;
}
