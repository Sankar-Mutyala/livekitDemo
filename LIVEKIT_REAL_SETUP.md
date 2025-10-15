# Real LiveKit Integration Setup

This guide will help you set up the video conferencing app with a real LiveKit server for actual real-time video calls.

## Option 1: LiveKit Cloud (Recommended)

### Step 1: Create LiveKit Cloud Account
1. Go to [LiveKit Cloud](https://cloud.livekit.io/)
2. Sign up for a free account
3. Create a new project
4. Get your API Key and API Secret from the project dashboard

### Step 2: Update Configuration
Update `src/config/livekit.ts`:

```typescript
export const LIVEKIT_CONFIG = {
  serverUrl: 'wss://your-project.livekit.cloud', // Your LiveKit Cloud URL
  generateToken: async (roomName: string, participantName: string) => {
    const response = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName, participantName }),
    });
    
    const { token } = await response.json();
    return token;
  },
  // ... rest of config
};
```

### Step 3: Create Token Server
Create a simple token server (Node.js/Express):

```javascript
// server.js
const express = require('express');
const { AccessToken } = require('livekit-server-sdk');

const app = express();
app.use(express.json());

const API_KEY = 'your-api-key';
const API_SECRET = 'your-api-secret';

app.post('/api/token', (req, res) => {
  const { roomName, participantName } = req.body;
  
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
});

app.listen(3001, () => {
  console.log('Token server running on port 3001');
});
```

### Step 4: Install Dependencies
```bash
npm install livekit-server-sdk express
```

### Step 5: Run the Application
1. Start the token server: `node server.js`
2. Start the React app: `npm start`
3. Open multiple browser tabs to test with multiple participants

## Option 2: Self-Hosted LiveKit Server

### Step 1: Install LiveKit Server
```bash
# Using Docker
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server --dev
```

### Step 2: Update Configuration
```typescript
export const LIVEKIT_CONFIG = {
  serverUrl: 'ws://localhost:7880', // Your local server
  // ... rest of config
};
```

### Step 3: Create Token Server
Use the same token server as above, but with your local server's API key/secret.

## Testing Real-Time Functionality

1. **Open Multiple Tabs**: Open the app in multiple browser tabs
2. **Join Same Room**: Use the same room name in all tabs
3. **Test Features**:
   - Camera on/off
   - Microphone mute/unmute
   - Screen sharing
   - Participant joining/leaving

## Features That Work in Real-Time

✅ **Real Video/Audio Streaming**: Actual camera and microphone feeds
✅ **Participant Management**: Real participants joining and leaving
✅ **Mute/Unmute**: Real-time audio control
✅ **Camera Control**: Real-time video control
✅ **Screen Sharing**: Actual screen sharing functionality
✅ **Dynamic Layouts**: Automatic layout changes based on participant count
✅ **Cross-Platform**: Works on desktop and mobile browsers

## Troubleshooting

### Connection Issues
- Check your LiveKit server URL
- Verify API key and secret are correct
- Ensure token server is running
- Check browser console for errors

### Permission Issues
- Allow camera/microphone permissions when prompted
- Check browser settings for media permissions
- Try refreshing the page

### Video Not Showing
- Check if camera is enabled
- Verify camera permissions
- Check if other participants have their cameras on

## Production Deployment

For production deployment:

1. **Use HTTPS**: LiveKit requires secure connections in production
2. **Proper Token Server**: Implement secure token generation on your backend
3. **Environment Variables**: Store API keys securely
4. **Error Handling**: Add proper error handling and user feedback
5. **Authentication**: Add user authentication if needed

## Environment Variables

Create a `.env` file:

```env
REACT_APP_LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
```

## Support

- [LiveKit Documentation](https://docs.livekit.io/)
- [LiveKit Cloud](https://cloud.livekit.io/)
- [LiveKit Discord](https://discord.gg/livekit)
