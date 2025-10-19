// Test script to verify LiveKit credentials
const crypto = require('crypto');

// Replace these with your actual credentials from LiveKit Cloud
const API_KEY = 'APIB2aqRGFAhxAY';
const API_SECRET = 'K9PmxEGU152RJZGxRvLD9Bf8LfPKPQeteFy1gjhrIt3B';

function generateLiveKitToken(apiKey, apiSecret, roomName, identity, name) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (6 * 60 * 60); // 6 hours expiry

  // LiveKit token payload
  const payload = {
    iss: apiKey,
    sub: identity,
    iat: now,
    exp: exp,
    video: {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    },
    name: name
  };

  // Create JWT header
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  // Base64URL encode
  const base64urlEscape = (str) => {
    return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const base64urlEncode = (obj) => {
    return base64urlEscape(Buffer.from(JSON.stringify(obj)).toString('base64'));
  };

  const encodedHeader = base64urlEncode(header);
  const encodedPayload = base64urlEncode(payload);

  // Create signature using Node.js crypto
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(data)
    .digest('base64');
  
  const encodedSignature = base64urlEscape(signature);

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

console.log('Testing LiveKit credentials...');
console.log('API Key:', API_KEY.substring(0, 10) + '...');

try {
  const jwt = generateLiveKitToken(API_KEY, API_SECRET, 'test-room', 'test-user', 'Test User');
  console.log('✅ SUCCESS: Token generated successfully!');
  console.log('Token length:', jwt.length);
  console.log('First 50 chars:', jwt.substring(0, 50) + '...');
  
} catch (error) {
  console.log('❌ ERROR:', error.message);
  console.log('Please check your API_KEY and API_SECRET');
}
