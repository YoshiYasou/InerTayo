'use strict';

const assert = require('node:assert/strict');
const { createVerificationEmail, getApplicationUrl } = require('../server/services/emailVerification');

const originalFrontendUrl = process.env.FRONTEND_URL;
const originalTokenTtl = process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS;
const originalNodeEnv = process.env.NODE_ENV;

try {
    process.env.NODE_ENV = 'test';
    delete process.env.FRONTEND_URL;
    assert.equal(getApplicationUrl(), 'http://localhost:3000');
    process.env.FRONTEND_URL = 'https://app.example.test';
    delete process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS;
    const email = createVerificationEmail(
        { username: '<img src=x onerror=alert(1)>', email: 'commuter@example.com' },
        'A'.repeat(43)
    );
    assert.equal(email.subject, 'Verify Your InerTayo Email Address');
    assert.match(email.html, /Verify My Email/);
    assert.match(email.html, /expires in 24 hours/i);
    assert.match(email.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(email.html, /<img src=x onerror=alert\(1\)>/);
    assert.match(email.text, /https:\/\/app\.example\.test\/verify-email\?token=/);
    assert.match(email.html, /https:\/\/app\.example\.test\/verify-email\?token=/);

    process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS = '1';
    const oneHourEmail = createVerificationEmail(
        { username: 'commuter', email: 'commuter@example.com' },
        'B'.repeat(43)
    );
    assert.match(oneHourEmail.text, /expires in 1 hour/i);
    assert.match(oneHourEmail.html, /expires in 1 hour/i);
    process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS = '0';
    assert.throws(() => createVerificationEmail({ email: 'commuter@example.com' }, 'C'.repeat(43)), /integer from 1 to 168/);

    process.env.FRONTEND_URL = 'http://example.com';
    assert.throws(() => getApplicationUrl(), /trusted HTTPS/);
    console.log('Email verification template tests passed.');
} finally {
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
    if (originalTokenTtl === undefined) delete process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS;
    else process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS = originalTokenTtl;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
}
