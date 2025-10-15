const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Replace with your actual LiveKit API key and secret from LiveKit Cloud
const API_KEY = process.env.LIVEKIT_API_KEY || 'APIxC7TmCridcUg';
const API_SECRET = process.env.LIVEKIT_API_SECRET || 'pjNoDnaUr8lU7wIkJcdQLHENiQztmOcgguA2whQpgYL';

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Token server is running' });
});

// Generate LiveKit JWT token using Node.js crypto
const crypto = require('crypto');

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

// Test token generation endpoint
app.get('/api/test-token', (req, res) => {
  try {
    const token = generateLiveKitToken(API_KEY, API_SECRET, 'test-room', 'test-user', 'Test User');
    
    res.json({ 
      success: true, 
      token: token,
      apiKey: API_KEY.substring(0, 10) + '...',
      message: 'Token generated successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      apiKey: API_KEY.substring(0, 10) + '...'
    });
  }
});

app.post('/api/token', (req, res) => {
  try {
    const { roomName, participantName } = req.body;
    
    console.log('Token request received:', { roomName, participantName });
    
    if (!roomName || !participantName) {
      return res.status(400).json({ error: 'Room name and participant name are required' });
    }

    if (API_KEY === 'YOUR_ACTUAL_API_KEY_FROM_LIVEKIT_CLOUD' || API_SECRET === 'YOUR_ACTUAL_API_SECRET_FROM_LIVEKIT_CLOUD') {
      return res.status(500).json({ error: 'Please update API_KEY and API_SECRET in server.js with your actual LiveKit credentials' });
    }

    const token = generateLiveKitToken(API_KEY, API_SECRET, roomName, participantName, participantName);
    
    console.log(`Generated token for ${participantName} in room ${roomName}`);
    console.log(`Using API Key: ${API_KEY.substring(0, 10)}...`);
    res.json({ token: token });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Failed to generate token: ' + error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Token server running on port ${PORT}`);
  console.log(`API Key: ${API_KEY}`);
  console.log('Ready to generate tokens for video conferences!');
});
