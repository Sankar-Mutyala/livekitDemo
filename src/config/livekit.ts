// No imports needed - using browser's Web Crypto API

// LiveKit configuration
export const LIVEKIT_CONFIG = {
  // Replace with your actual LiveKit server URL
  serverUrl: process.env.REACT_APP_LIVEKIT_URL || 'wss://test-48t5r1cq.livekit.cloud',
  
  // For development, we'll use a simple token generation
  // In production, generate tokens on your server
  generateToken: async (roomName: string, participantName: string) => {
    try {
      // Try to get token from your server first
      const response = await fetch('http://localhost:3001/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName, participantName }),
      });
      
      if (response.ok) {
        const { token } = await response.json();
        return token;
      }
    } catch (error) {
      console.log('No token server available, using development token');
    }
    
    // Fallback: Generate a development token (for testing only)
    return await generateDevToken(roomName, participantName);
  },
  
  // Room configuration
  roomConfig: {
    adaptiveStream: true,
    dynacast: true,
    autoSubscribe: true,
    publishDefaults: {
      videoCodec: 'vp9',
      audioCodec: 'opus',
      videoSimulcastLayers: [
        { width: 320, height: 240, resolution: { width: 320, height: 240 }, encoding: { maxBitrate: 200_000 } },
        { width: 640, height: 480, resolution: { width: 640, height: 480 }, encoding: { maxBitrate: 500_000 } },
        { width: 1280, height: 720, resolution: { width: 1280, height: 720 }, encoding: { maxBitrate: 1_000_000 } },
      ],
    },
  },
};

// Development token generation (for testing only)
async function generateDevToken(roomName: string, participantName: string): Promise<string> {
  // For development ONLY - use your actual API key and secret from LiveKit
  const apiKey = process.env.REACT_APP_LIVEKIT_API_KEY || 'devkey';
  const apiSecret = process.env.REACT_APP_LIVEKIT_API_SECRET || 'secret';
  
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: apiKey,
    sub: participantName,
    iat: now,
    exp: now + 86400, // 24 hours
    nbf: now,
    video: {
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
    }
  };
  
  return encodeJWT(header, payload, apiSecret);
}

// Proper JWT encoding with HMAC signature (using Web Crypto API)
async function encodeJWT(header: any, payload: any, secret: string): Promise<string> {
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  
  const message = `${encodedHeader}.${encodedPayload}`;
  
  // Import secret key
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Sign the message
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const signature = base64UrlEncode(
    String.fromCharCode.apply(null, Array.from(new Uint8Array(signatureBuffer)))
  );
  
  return `${message}.${signature}`;
}

// URL-safe base64 encoding
function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Instructions for setting up LiveKit server
export const SETUP_INSTRUCTIONS = `
To fix the connection drop issue:

1. Get your LiveKit API Key and Secret from your LiveKit server
2. Set environment variables:
   REACT_APP_LIVEKIT_API_KEY=your_api_key
   REACT_APP_LIVEKIT_API_SECRET=your_api_secret
   REACT_APP_LIVEKIT_URL=your_server_url

3. The development token now uses proper HMAC-SHA256 signature
4. Token expiration increased to 24 hours

RECOMMENDED FOR PRODUCTION:
- Generate tokens server-side using LiveKit SDK
- Never expose API secret in client-side code
- Use short-lived tokens (15-60 minutes)
`;