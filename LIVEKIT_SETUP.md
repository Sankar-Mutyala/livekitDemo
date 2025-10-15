# LiveKit Video Conference Setup

This application is now integrated with LiveKit.io for real-time video conferencing. The UI components are fully functional and ready to use.

## Features

- ✅ Real-time video and audio streaming
- ✅ Dynamic layout based on participant count
- ✅ Mute/unmute microphone
- ✅ Turn camera on/off
- ✅ Screen sharing capability
- ✅ Responsive design for mobile and desktop
- ✅ Participant status indicators
- ✅ Room creation and joining

## Current Status

The application is set up with LiveKit integration but uses mock participants for demonstration purposes. To use with a real LiveKit server, follow the setup instructions below.

## Setup Instructions

### 1. LiveKit Server Setup

You have two options:

#### Option A: LiveKit Cloud (Recommended for quick start)
1. Sign up at [LiveKit Cloud](https://cloud.livekit.io/)
2. Create a new project
3. Get your server URL and API key/secret

#### Option B: Self-hosted LiveKit Server
1. Follow the [LiveKit deployment guide](https://docs.livekit.io/deploy/)
2. Set up your server with proper SSL certificates

### 2. Token Server Setup

Create a simple token server to generate JWT tokens for participants:

```javascript
// Example token server (Node.js/Express)
const express = require('express');
const { AccessToken } = require('livekit-server-sdk');

const app = express();
app.use(express.json());

app.post('/token', (req, res) => {
  const { roomName, participantName } = req.body;
  
  const token = new AccessToken(apiKey, apiSecret, {
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
```

### 3. Update Configuration

Update `src/config/livekit.ts`:

```typescript
export const LIVEKIT_CONFIG = {
  serverUrl: 'wss://your-livekit-server.com', // Your actual server URL
  generateToken: async (roomName: string, participantName: string) => {
    // Call your token server
    const response = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName, participantName }),
    });
    const { token } = await response.json();
    return token;
  },
};
```

### 4. Environment Variables

Create a `.env` file in the project root:

```env
REACT_APP_LIVEKIT_URL=wss://your-livekit-server.com
REACT_APP_LIVEKIT_API_KEY=your_api_key
REACT_APP_LIVEKIT_API_SECRET=your_api_secret
```

## Running the Application

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm start
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## UI Components

### RoomJoin Component
- Clean, modern interface for joining rooms
- Input fields for participant name and room name
- Options to create or join a room

### Room Component
- Dynamic video layout based on participant count
- Real-time participant management
- LiveKit integration for video/audio streaming

### VideoTile Component
- Displays video streams or participant avatars
- Shows mute/camera status indicators
- Responsive design for different screen sizes

### RoomControls Component
- Microphone toggle
- Camera toggle
- Screen sharing
- Leave room functionality

## Layout System

The application automatically adjusts the video layout based on the number of participants:

- **1 participant**: Single view
- **2 participants**: Main video + preview
- **3 participants**: Grid layout with preview
- **4+ participants**: Full grid layout

## Development Notes

- The app gracefully falls back to mock participants if LiveKit connection fails
- All UI components are fully functional with proper state management
- Responsive design works on mobile and desktop
- TypeScript support throughout the codebase

## Troubleshooting

1. **Connection Issues**: Check your LiveKit server URL and token generation
2. **Video Not Showing**: Ensure camera permissions are granted
3. **Audio Issues**: Check microphone permissions and browser audio settings
4. **Layout Problems**: Verify CSS classes are properly applied

## Next Steps

1. Set up your LiveKit server
2. Implement proper token generation
3. Add user authentication if needed
4. Deploy to production
5. Add additional features like chat, recording, etc.
