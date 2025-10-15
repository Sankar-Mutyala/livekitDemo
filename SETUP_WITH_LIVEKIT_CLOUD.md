# Complete Setup Guide - LiveKit Cloud Integration

## 🔑 Step 1: Create LiveKit Cloud Account

### 1.1 Sign Up
1. Go to [https://cloud.livekit.io/](https://cloud.livekit.io/)
2. Click **"Sign Up"** or **"Get Started"**
3. Enter your email and create a password
4. Verify your email address

### 1.2 Create Project
1. After logging in, you'll see the LiveKit Cloud dashboard
2. Click **"Create Project"** or **"New Project"**
3. Fill in the details:
   - **Project Name**: `Video Conference App` (or any name you prefer)
   - **Region**: Choose the region closest to your users
   - **Plan**: Select "Free" for testing
4. Click **"Create Project"**

### 1.3 Get Your Credentials
1. Once your project is created, you'll see the project dashboard
2. Look for the **"API Keys"** section
3. You'll see:
   - **API Key**: `APIxxxxxxxxxxxxxxxx` (copy this)
   - **API Secret**: A long string of characters (copy this)
4. Also note your **Server URL**: `wss://your-project-name.livekit.cloud`

## 🔧 Step 2: Configure Your App

### 2.1 Update Server Configuration
Edit `server/server.js` and replace the placeholder values:

```javascript
// Replace these with your actual values from LiveKit Cloud
const API_KEY = 'YOUR_API_KEY_HERE';        // Your API Key from step 1.3
const API_SECRET = 'YOUR_API_SECRET_HERE';  // Your API Secret from step 1.3
```

### 2.2 Update App Configuration
Edit `src/config/livekit.ts` and replace the server URL:

```typescript
export const LIVEKIT_CONFIG = {
  // Replace with your actual LiveKit server URL from step 1.3
  serverUrl: 'wss://your-project-name.livekit.cloud',
  // ... rest stays the same
};
```

## 🚀 Step 3: Start the Application

### 3.1 Install Dependencies
```bash
# Install token server dependencies
cd server
npm install

# Install app dependencies (if not already done)
cd ..
npm install
```

### 3.2 Start Token Server
```bash
cd server
npm start
```
You should see:
```
Token server running on port 3001
API Key: YOUR_API_KEY_HERE
Ready to generate tokens for video conferences!
```

### 3.3 Start React App
```bash
# In a new terminal
npm start
```

## 🧪 Step 4: Test Real-Time Video Calls

### 4.1 Open Multiple Browser Tabs
1. Open your app in multiple browser tabs/windows
2. Use the same room name in all tabs
3. Use different participant names

### 4.2 Test Features
- **Camera**: Click camera button to turn on/off
- **Microphone**: Click mic button to mute/unmute
- **Screen Share**: Click screen share button
- **Multiple Participants**: See all participants in different layouts

## ✅ What You Should See

- **Real Video Streams**: Actual camera feeds from all participants
- **Live Audio**: Real microphone audio from all participants
- **Dynamic Layouts**: Layout changes based on participant count
- **Working Controls**: All buttons work in real-time
- **Cross-Platform**: Works on desktop and mobile

## 🔍 Troubleshooting

### Connection Issues
- ✅ Check your API key and secret are correct
- ✅ Verify your server URL is correct
- ✅ Make sure token server is running
- ✅ Check browser console for errors

### Permission Issues
- ✅ Allow camera/microphone when prompted
- ✅ Check browser settings for media permissions
- ✅ Try refreshing the page

### Video Not Showing
- ✅ Check if camera is enabled
- ✅ Verify camera permissions
- ✅ Check if other participants have cameras on

## 📱 Testing with Multiple Devices

1. **Same Computer**: Open multiple browser tabs
2. **Different Computers**: Use the same room name
3. **Mobile Devices**: Open in mobile browser
4. **Different Networks**: Test from different locations

## 🎉 Success!

If everything is working, you should see:
- Real video streams from all participants
- Live audio from all participants
- Working mute/unmute and camera controls
- Screen sharing functionality
- Dynamic layouts based on participant count

Your video conferencing app is now fully functional with real LiveKit integration!
