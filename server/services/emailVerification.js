'use strict';

const crypto = require('crypto');
const { sendEmail } = require('./emailSender');

function getTokenLifetimeHours() {
    const configured = process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS;
    if (configured === undefined || configured.trim() === '') return 24;
    const hours = Number(configured);
    if (!Number.isSafeInteger(hours) || hours < 1 || hours > 168) {
        throw new Error('EMAIL_VERIFICATION_TOKEN_TTL_HOURS must be an integer from 1 to 168.');
    }
    return hours;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function getApplicationUrl() {
    const configuredUrl = process.env.FRONTEND_URL?.trim() ||
        process.env.RENDER_EXTERNAL_URL?.trim() ||
        (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');
    if (!configuredUrl) {
        throw new Error('FRONTEND_URL must be configured before sending verification email.');
    }

    let appUrl;
    try {
        appUrl = new URL(configuredUrl);
    } catch {
        throw new Error('FRONTEND_URL must be a valid application URL.');
    }
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(appUrl.hostname);
    if (!['http:', 'https:'].includes(appUrl.protocol) ||
        appUrl.username || appUrl.password || appUrl.search || appUrl.hash ||
        (process.env.NODE_ENV === 'production' && appUrl.protocol !== 'https:') ||
        (appUrl.protocol === 'http:' && !isLocal)) {
        throw new Error('FRONTEND_URL must be a trusted HTTPS application URL.');
    }
    return appUrl.origin;
}

function createVerificationEmail(user, token) {
    const lifetimeHours = getTokenLifetimeHours();
    const verificationUrl = new URL('/verify-email', getApplicationUrl());
    verificationUrl.searchParams.set('token', token);
    const link = verificationUrl.toString();
    const greeting = escapeHtml(user.username || 'there');
    const safeLink = escapeHtml(link);
    const text = [
        `Hello ${user.username || 'there'},`,
        '',
        'You registered for an InerTayo account. Verify your email address by opening this link:',
        link,
        '',
        `This link expires in ${lifetimeHours} ${lifetimeHours === 1 ? 'hour' : 'hours'}. If you did not register, you can ignore this email.`,
        '',
        'InerTayo Dagupan City Commute Guide'
    ].join('\n');
    const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px;background:#f1f5f9">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
        <tr><td style="padding:28px 32px;background:#0f172a;color:#fff;font-size:24px;font-weight:700">InerTayo</td></tr>
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3">Verify Your InerTayo Email Address</h1>
          <p style="font-size:16px;line-height:1.6">Hello ${greeting},</p>
          <p style="font-size:16px;line-height:1.6">You registered for an InerTayo account. Confirm your email address to activate your account.</p>
          <p style="margin:28px 0;text-align:center"><a href="${safeLink}" style="display:inline-block;padding:14px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Verify My Email</a></p>
          <p style="font-size:14px;line-height:1.6">If the button does not work, copy and paste this link into your browser:</p>
          <p style="font-size:13px;line-height:1.6;overflow-wrap:anywhere"><a href="${safeLink}" style="color:#047857">${safeLink}</a></p>
          <p style="font-size:14px;line-height:1.6">This link expires in ${lifetimeHours} ${lifetimeHours === 1 ? 'hour' : 'hours'}. If you did not register, you can ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    return { to: user.email, subject: 'Verify Your InerTayo Email Address', text, html };
}

async function sendVerificationEmail(user, token) {
    if (process.env.NODE_ENV === 'test') {
        global.__testMailbox = {
            to: user.email,
            purpose: 'EMAIL_VERIFICATION',
            verificationToken: token
        };
        return { accepted: true };
    }
    return sendEmail(createVerificationEmail(user, token));
}

function createVerificationToken() {
    const token = crypto.randomBytes(32).toString('base64url');
    return {
        token,
        tokenHash: crypto.createHash('sha256').update(token).digest('hex')
    };
}

function hashVerificationToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
    createVerificationEmail,
    createVerificationToken,
    getTokenLifetimeHours,
    getApplicationUrl,
    hashVerificationToken,
    sendVerificationEmail
};
