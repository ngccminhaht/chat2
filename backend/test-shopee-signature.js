/**
 * Test script to verify Shopee signature generation
 *
 * Usage:
 *   SHOPEE_PARTNER_ID=your_id SHOPEE_PARTNER_KEY=your_key node test-shopee-signature.js
 */

const crypto = require('crypto');

// Get from environment or use defaults
const partnerId = process.env.SHOPEE_PARTNER_ID || '1110319';
const partnerKey = process.env.SHOPEE_PARTNER_KEY || 'your_partner_key_here';
const path = '/api/v2/shop/auth_partner';

// Use a fixed timestamp for testing (or current time)
const timestamp = process.env.TEST_TIMESTAMP
  ? parseInt(process.env.TEST_TIMESTAMP)
  : Math.floor(Date.now() / 1000);

console.log('=== Shopee Signature Test ===\n');

// Test 1: With original partner key
console.log('Test 1: Original partner key');
console.log('-'.repeat(50));
const baseString1 = `${partnerId}${path}${timestamp}`;
console.log('Partner ID:', partnerId);
console.log('Path:', path);
console.log('Timestamp:', timestamp);
console.log('Base string:', baseString1);
console.log('Partner key (first 20):', partnerKey.substring(0, 20) + '...');
console.log('Partner key length:', partnerKey.length);

const hmac1 = crypto.createHmac('sha256', partnerKey);
hmac1.update(baseString1);
const signature1 = hmac1.digest('hex');
console.log('Signature:', signature1);
console.log();

// Test 2: With 'shpk' prefix removed (if exists)
if (partnerKey.startsWith('shpk')) {
  console.log('Test 2: Partner key with "shpk" prefix removed');
  console.log('-'.repeat(50));
  const cleanKey = partnerKey.substring(4);
  console.log('Clean key (first 20):', cleanKey.substring(0, 20) + '...');
  console.log('Clean key length:', cleanKey.length);

  const hmac2 = crypto.createHmac('sha256', cleanKey);
  hmac2.update(baseString1);
  const signature2 = hmac2.digest('hex');
  console.log('Signature:', signature2);
  console.log();
}

// Test 3: Compare with expected signature (if provided)
if (process.env.EXPECTED_SIGNATURE) {
  console.log('Signature verification:');
  console.log('-'.repeat(50));
  console.log('Expected:', process.env.EXPECTED_SIGNATURE);
  console.log('Got:     ', signature1);
  console.log('Match:   ', signature1 === process.env.EXPECTED_SIGNATURE ? '✅ YES' : '❌ NO');
}

console.log('\n=== Example curl command ===');
const url = `https://partner.test-stable.shopeemobile.com${path}?partner_id=${partnerId}&redirect=https://your-redirect-uri&sign=${signature1}&timestamp=${timestamp}`;
console.log(url);
