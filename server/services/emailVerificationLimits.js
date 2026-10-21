'use strict';

const crypto = require('crypto');
const EmailVerificationAttempt = require('../models/EmailVerificationAttempt');

function getPositiveInteger(name, fallback, maximum) {
    const configured = process.env[name];
    if (configured === undefined || configured.trim() === '') return fallback;
    const value = Number(configured);
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
        throw new Error(`${name} must be an integer from 1 to ${maximum}.`);
    }
    return value;
}

function getVerificationLimits() {
    return {
        cooldownMs: getPositiveInteger('EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS', 60, 3600) * 1000,
        accountDailyLimit: getPositiveInteger('EMAIL_VERIFICATION_DAILY_LIMIT', 5, 100),
        ipLimit: getPositiveInteger('EMAIL_VERIFICATION_IP_LIMIT', 10, 1000),
        ipWindowMs: getPositiveInteger('EMAIL_VERIFICATION_IP_WINDOW_MINUTES', 60, 1440) * 60 * 1000
    };
}

function hashRateLimitKey(value) {
    const secret = process.env.JWT_SECRET || 'test-only-email-rate-limit-key';
    return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

async function reserveAttempt(key, limit, windowMs, cooldownMs = 0) {
    const now = new Date();
    const windowCutoff = new Date(now.getTime() - windowMs);
    const cooldownCutoff = new Date(now.getTime() - cooldownMs);
    const expiresAt = new Date(now.getTime() + windowMs);

    for (let retry = 0; retry < 3; retry += 1) {
        const withinWindow = {
            key,
            window_started_at: { $gt: windowCutoff },
            count: { $lt: limit }
        };
        if (cooldownMs) withinWindow.last_attempt_at = { $lte: cooldownCutoff };

        const incremented = await EmailVerificationAttempt.findOneAndUpdate(
            withinWindow,
            {
                $inc: { count: 1 },
                $set: { last_attempt_at: now, expires_at: expiresAt }
            },
            { returnDocument: 'after' }
        );
        if (incremented) return true;

        const expiredWindow = { key, window_started_at: { $lte: windowCutoff } };
        if (cooldownMs) expiredWindow.last_attempt_at = { $lte: cooldownCutoff };
        const reset = await EmailVerificationAttempt.findOneAndUpdate(
            expiredWindow,
            {
                $set: {
                    window_started_at: now,
                    last_attempt_at: now,
                    count: 1,
                    expires_at: expiresAt
                }
            },
            { returnDocument: 'after' }
        );
        if (reset) return true;

        try {
            await EmailVerificationAttempt.create({
                key,
                window_started_at: now,
                last_attempt_at: now,
                count: 1,
                expires_at: expiresAt
            });
            return true;
        } catch (error) {
            if (error.code !== 11000) throw error;
        }
    }

    return false;
}

async function reserveIpAttempt(ip) {
    const limits = getVerificationLimits();
    const ipKey = `ip:${hashRateLimitKey(String(ip || 'unknown'))}`;
    return reserveAttempt(ipKey, limits.ipLimit, limits.ipWindowMs);
}

async function reserveAccountAttempt(userId, limits = getVerificationLimits()) {
    const accountKey = `account:${userId}`;
    if (!await reserveAttempt(accountKey, limits.accountDailyLimit, 24 * 60 * 60 * 1000, limits.cooldownMs)) {
        return { allowed: false, reason: 'account' };
    }
    return { allowed: true };
}

module.exports = {
    getPositiveInteger,
    getVerificationLimits,
    hashRateLimitKey,
    reserveAttempt,
    reserveIpAttempt,
    reserveAccountAttempt
};
