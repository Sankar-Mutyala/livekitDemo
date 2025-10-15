// LiveKit configuration
export const LIVEKIT_CONFIG = {
  // Replace with your actual LiveKit server URL
  serverUrl: process.env.REACT_APP_LIVEKIT_URL || 'wss://responsive-preview-9g82oqy0.livekit.cloud',
  
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
    return generateDevToken(roomName, participantName);
  },
  
  // Room configuration
  roomConfig: {
    adaptiveStream: true,
    dynacast: true,
    publishDefaults: {
      videoSimulcastLayers: [
        { width: 320, height: 240, resolution: { width: 320, height: 240 }, encoding: { maxBitrate: 200_000 } },
        { width: 640, height: 480, resolution: { width: 640, height: 480 }, encoding: { maxBitrate: 500_000 } },
        { width: 1280, height: 720, resolution: { width: 1280, height: 720 }, encoding: { maxBitrate: 1_000_000 } },
      ],
    },
  },
};

// Development token generation (for testing only)
function generateDevToken(roomName: string, participantName: string): string {
  // This is a simple development token - NOT for production use
  // In production, use proper JWT tokens with your API key/secret
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  const payload = {
    iss: 'dev-key',
    sub: participantName,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    room: roomName,
    video: {
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    }
  };
  
  // Simple base64 encoding (NOT secure - for development only)
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  const signature = btoa('dev-signature');
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// Instructions for setting up LiveKit server
export const SETUP_INSTRUCTIONS = `
To use this application with a real LiveKit server:

1. Set up a LiveKit server (cloud or self-hosted)
2. Create a token server to generate JWT tokens
3. Update the LIVEKIT_CONFIG.serverUrl with your server URL
4. Replace the generateToken function with a call to your token server

For development, the app will show mock participants if it can't connect to a LiveKit server.
`;
