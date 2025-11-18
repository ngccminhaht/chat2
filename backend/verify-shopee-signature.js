#!/usr/bin/env node
/**
 * Verify Shopee signature generation matches PHP implementation
 *
 * PHP reference:
 * $baseString = sprintf("%s%s%s", $partnerId, $path, $timest);
 * $sign = hash_hmac('sha256', $baseString, $partnerKey);
 *
 * Usage:
 *   node verify-shopee-signature.js
 *   # Or with custom values:
 *   SHOPEE_PARTNER_ID=xxx SHOPEE_PARTNER_KEY=xxx node verify-shopee-signature.js
 */

const crypto = require('crypto');
require('dotenv').config();

// Get credentials from environment
const partnerId = process.env.SHOPEE_PARTNER_ID;
const partnerKey = process.env.SHOPEE_PARTNER_KEY;

if (!partnerId || !partnerKey) {
  console.error('❌ Error: SHOPEE_PARTNER_ID and SHOPEE_PARTNER_KEY must be set');
  console.error('   Either set them in .env file or pass as environment variables');
  process.exit(1);
}

// Test parameters
const path = '/api/v2/shop/auth_partner';
const timestamp = Math.floor(Date.now() / 1000);

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║      Shopee Signature Verification (PHP Compatible)       ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log();

console.log('📋 Configuration:');
console.log('─'.repeat(60));
console.log(`Partner ID:       ${partnerId}`);
console.log(`Partner Key:      ${partnerKey.substring(0, 20)}... (${partnerKey.length} chars)`);
console.log(`Path:             ${path}`);
console.log(`Timestamp:        ${timestamp}`);
console.log();

// Generate base string exactly like PHP: sprintf("%s%s%s", $partnerId, $path, $timest)
const baseString = `${partnerId}${path}${timestamp}`;
console.log('🔨 Base String Generation:');
console.log('─'.repeat(60));
console.log(`Format:           partnerId + path + timestamp`);
console.log(`Base String:      ${baseString}`);
console.log();

// Generate signature exactly like PHP: hash_hmac('sha256', $baseString, $partnerKey)
const hmac = crypto.createHmac('sha256', partnerKey);
hmac.update(baseString);
const signature = hmac.digest('hex');

console.log('🔐 Signature Generation:');
console.log('─'.repeat(60));
console.log(`Algorithm:        HMAC-SHA256`);
console.log(`Signature:        ${signature}`);
console.log();

// Generate full URL
const host = 'https://openplatform.sandbox.test-stable.shopee.sg';
const redirectUri = process.env.SHOPEE_REDIRECT_URI || 'http://localhost:3000/api/platform-connections/shopee/callback';
const fullUrl = `${host}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${signature}&redirect=${encodeURIComponent(redirectUri)}`;

console.log('🌐 Generated URL:');
console.log('─'.repeat(60));
console.log(fullUrl);
console.log();

// PHP equivalent code
console.log('📝 PHP Equivalent Code:');
console.log('─'.repeat(60));
console.log(`<?php`);
console.log(`$partnerId = ${partnerId};`);
console.log(`$partnerKey = "${partnerKey}";`);
console.log(`$path = "${path}";`);
console.log(`$timest = ${timestamp};`);
console.log(`$redirectUrl = "${redirectUri}";`);
console.log();
console.log(`$baseString = sprintf("%s%s%s", $partnerId, $path, $timest);`);
console.log(`$sign = hash_hmac('sha256', $baseString, $partnerKey);`);
console.log();
console.log(`echo "Base String: " . $baseString . "\\n";`);
console.log(`echo "Signature: " . $sign . "\\n";`);
console.log(`?>`);
console.log();

console.log('✅ Verification Steps:');
console.log('─'.repeat(60));
console.log('1. Copy the PHP code above');
console.log('2. Run it on a PHP environment');
console.log('3. Compare the Base String and Signature outputs');
console.log('4. They should EXACTLY match the values shown above');
console.log();

// Test with known values (from your PHP example)
console.log('🧪 Test with PHP Example Values:');
console.log('─'.repeat(60));
const testPartnerId = '847892';
const testPartnerKey = '57615053704d6470644f554a78656d50484143644964436a5568777544524579';
const testTimestamp = 1234567890; // Fixed timestamp for reproducibility

const testBaseString = `${testPartnerId}${path}${testTimestamp}`;
const testHmac = crypto.createHmac('sha256', testPartnerKey);
testHmac.update(testBaseString);
const testSignature = testHmac.digest('hex');

console.log(`Test Partner ID:  ${testPartnerId}`);
console.log(`Test Partner Key: ${testPartnerKey}`);
console.log(`Test Timestamp:   ${testTimestamp}`);
console.log(`Test Base String: ${testBaseString}`);
console.log(`Test Signature:   ${testSignature}`);
console.log();
console.log('💡 Run this PHP code to verify:');
console.log(`<?php echo hash_hmac('sha256', '${testBaseString}', '${testPartnerKey}'); ?>`);
console.log();

console.log('═'.repeat(60));
console.log('✨ Done! Use the generated URL to test Shopee OAuth flow.');
console.log('═'.repeat(60));
