// Simple token server for development
// This is NOT secure and should only be used for development

const express = require('express');
const { AccessToken } = require('livekit-server-sdk');

const app = express();
app.use(express.json());

// Development API key and secret (replace with your actual values)
const API_KEY = 'APIxC7TmCridcUg';
const API_SECRET = 'pjNoDnaUr8lU7wIkJcdQLHENiQztmOcgguA2whQpgYL';

app.post('/api/token', (req, res) => {
  try {
    const { roomName, participantName } = req.body;
    
    if (!roomName || !participantName) {
      return res.status(400).json({ error: 'Room name and participant name are required' });
    }

    const token = new AccessToken(API_KEY, API_SECRET, {
      identity: participantName,
      ttl: '1h',
    });
    
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });
    
    res.json({ token: token.toJwt() });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Token server running on port ${PORT}`);
});
