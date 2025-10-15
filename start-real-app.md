# Quick Start - Real LiveKit Video Conference

## Prerequisites
You need a LiveKit server running. Choose one option:

### Option A: LiveKit Cloud (Easiest)
1. Go to [LiveKit Cloud](https://cloud.livekit.io/)
2. Create a free account and project
3. Get your API Key and Secret from the dashboard
4. Update the server configuration below

### Option B: Local LiveKit Server
```bash
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server --dev
```

## Setup Steps

### 1. Configure Your LiveKit Server
Update `src/config/livekit.ts`:
```typescript
export const LIVEKIT_CONFIG = {
  serverUrl: 'wss://your-project.livekit.cloud', // Your LiveKit URL
  // ... rest stays the same
};
```

### 2. Start Token Server
```bash
cd server
npm install
# Update API_KEY and API_SECRET in server.js
npm start
```

### 3. Start React App
```bash
npm start
```

### 4. Test Real-Time Video Calls
1. Open multiple browser tabs/windows
2. Join the same room name in all tabs
3. Allow camera/microphone permissions
4. Test video, audio, and screen sharing

## What You'll See
- Real video streams from all participants
- Live audio from all participants
- Real-time participant joining/leaving
- Working mute/unmute and camera controls
- Screen sharing functionality
- Dynamic layouts based on participant count

## Troubleshooting
- Make sure your LiveKit server is running
- Check browser console for connection errors
- Ensure camera/microphone permissions are granted
- Verify your API key and secret are correct

## Features Working in Real-Time
✅ Real video/audio streaming
✅ Multiple participants
✅ Mute/unmute controls
✅ Camera on/off
✅ Screen sharing
✅ Dynamic layouts
✅ Cross-platform support
