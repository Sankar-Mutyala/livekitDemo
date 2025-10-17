import React, { useEffect, useState, useRef } from 'react';
import VideoTile from './VideoTile';
import RoomControls from './RoomControls';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { LiveKitManager, ParticipantData } from '../lib/livekit';
import { LIVEKIT_CONFIG } from '../config/livekit';

interface RoomProps {
  roomName: string;
  participantName: string;
  isRoomCreator: boolean;
  onLeaveRoom: () => void;
}

const Room: React.FC<RoomProps> = ({ roomName, participantName, isRoomCreator, onLeaveRoom }) => {
  const [participants, setParticipants] = useState<ParticipantData[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const liveKitManagerRef = useRef<LiveKitManager | null>(null);

  useEffect(() => {
    const connectToRoom = async () => {
      try {
        // Create LiveKit manager
        const manager = new LiveKitManager(
          (participants) => {
            setParticipants(participants);
            // Update local participant state
            const localParticipant = participants.find(p => p.isLocal);
            if (localParticipant) {
              setIsMuted(localParticipant.isMuted);
              setIsCameraOn(localParticipant.isCameraOn);
            }
          },
          (connected) => {
            console.log('Connection state changed:', connected);
            setIsConnected(connected);
            if (!connected) {
              console.log('Room disconnected, attempting reconnection...');
              setConnectionAttempts(prev => prev + 1);
              // Attempt reconnection after a delay
              setTimeout(() => {
                if (liveKitManagerRef.current && !liveKitManagerRef.current.isConnected()) {
                  console.log('Attempting automatic reconnection...');
                  retryConnection();
                }
              }, 3000);
            }
          }
        );

        liveKitManagerRef.current = manager;

        // Use LiveKit configuration
        const config = {
          serverUrl: LIVEKIT_CONFIG.serverUrl,
          token: await LIVEKIT_CONFIG.generateToken(roomName, participantName),
        };

        await manager.connect(config, roomName, participantName, isRoomCreator);
        setIsConnecting(false);

      } catch (error) {
        console.error('Failed to connect to LiveKit room:', error);
        setConnectionError(error instanceof Error ? error.message : 'Failed to connect to room');
        setIsConnecting(false);
      }
    };

    connectToRoom();

    return () => {
      if (liveKitManagerRef.current) {
        liveKitManagerRef.current.disconnect();
      }
    };
  }, [roomName, participantName, isRoomCreator]);

  const toggleMute = async () => {
    if (liveKitManagerRef.current) {
      try {
        // Check connection state before attempting to toggle
        const connectionState = liveKitManagerRef.current.getConnectionState();
        console.log('Current connection state:', connectionState);
        
        if (!liveKitManagerRef.current.isConnected()) {
          console.warn('Room not connected, cannot toggle microphone');
          alert('Room is not connected. Please click "Reconnect" to restore connection.');
          return;
        }
        
        await liveKitManagerRef.current.toggleMicrophone();
      } catch (error) {
        console.error('Failed to toggle microphone:', error);
        alert('Failed to toggle microphone. Please try again.');
      }
    }
  };

  const toggleCamera = async () => {
    if (liveKitManagerRef.current) {
      try {
        // Check connection state before attempting to toggle
        const connectionState = liveKitManagerRef.current.getConnectionState();
        console.log('Current connection state:', connectionState);
        
        if (!liveKitManagerRef.current.isConnected()) {
          console.warn('Room not connected, cannot toggle camera');
          alert('Room is not connected. Please click "Reconnect" to restore connection.');
          return;
        }
        
        await liveKitManagerRef.current.toggleCamera();
      } catch (error) {
        console.error('Failed to toggle camera:', error);
        alert('Failed to toggle camera. Please try again.');
      }
    }
  };

  const toggleScreenShare = async () => {
    if (liveKitManagerRef.current) {
      await liveKitManagerRef.current.toggleScreenShare();
    }
  };

  const generateRoomLink = () => {
    const baseUrl = window.location.origin;
    const roomLink = `${baseUrl}?room=${encodeURIComponent(roomName)}`;
    return roomLink;
  };

  const copyRoomLink = async () => {
    const link = generateRoomLink();
    try {
      await navigator.clipboard.writeText(link);
      alert('Room link copied to clipboard!');
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = link;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('Room link copied to clipboard!');
    }
  };

  const debugConnection = () => {
    if (liveKitManagerRef.current) {
      const state = liveKitManagerRef.current.getConnectionState();
      const isConnected = liveKitManagerRef.current.isConnected();
      const localParticipant = liveKitManagerRef.current.getLocalParticipant();
      
      console.log('Debug Info:', {
        connectionState: state,
        isConnected,
        participants: participants.length,
        roomName,
        participantName,
        localParticipant: localParticipant ? {
          identity: localParticipant.identity,
          isMicrophoneEnabled: localParticipant.isMicrophoneEnabled,
          isCameraEnabled: localParticipant.isCameraEnabled
        } : null
      });
      
      alert(`Connection State: ${state}\nIs Connected: ${isConnected}\nParticipants: ${participants.length}\nLocal Participant: ${localParticipant ? 'Present' : 'Missing'}`);
    }
  };

  const refreshTracks = () => {
    if (liveKitManagerRef.current) {
      liveKitManagerRef.current.refreshVideoTracks();
    }
  };

  const enableCameraAndMic = async () => {
    if (liveKitManagerRef.current) {
      try {
        await liveKitManagerRef.current.enableCameraAndMicrophone();
        alert('Camera and microphone enabled!');
      } catch (error) {
        console.error('Failed to enable camera and microphone:', error);
        alert('Failed to enable camera and microphone. Please try again.');
      }
    }
  };

  const forceReconnect = async () => {
    console.log('Force reconnecting...');
    setConnectionAttempts(prev => prev + 1);
    await retryConnection();
  };

  const retryConnection = async () => {
    setRetryCount(prev => prev + 1);
    setConnectionError(null);
    setIsConnecting(true);
    
    try {
      // Disconnect existing connection
      if (liveKitManagerRef.current) {
        await liveKitManagerRef.current.disconnect();
      }
      
      // Wait a moment before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Reconnect
      const manager = new LiveKitManager(
        (participants) => {
          setParticipants(participants);
          const localParticipant = participants.find(p => p.isLocal);
          if (localParticipant) {
            setIsMuted(localParticipant.isMuted);
            setIsCameraOn(localParticipant.isCameraOn);
          }
        },
        (connected) => {
          setIsConnected(connected);
        }
      );

      liveKitManagerRef.current = manager;

      const config = {
        serverUrl: LIVEKIT_CONFIG.serverUrl,
        token: await LIVEKIT_CONFIG.generateToken(roomName, participantName),
      };

      await manager.connect(config, roomName, participantName, isRoomCreator);
      setIsConnecting(false);
      
    } catch (error) {
      console.error('Retry connection failed:', error);
      setConnectionError(error instanceof Error ? error.message : 'Failed to reconnect');
      setIsConnecting(false);
    }
  };

  const getLayoutClass = () => {
    const participantCount = participants.length;
    
    if (participantCount === 2) {
      return isRoomCreator ? 'layout-two-creator' : 'layout-two-participant';
    } else if (participantCount === 3) {
      return isRoomCreator ? 'layout-three-creator' : 'layout-three-participant';
    } else if (participantCount >= 4) {
      return 'layout-grid';
    }
    
    return 'layout-single';
  };

  const getVideoTiles = () => {
    const participantCount = participants.length;
    const localParticipant = participants.find(p => p.isLocal);
    const otherParticipants = participants.filter(p => !p.isLocal);

    if (participantCount === 2) {
      if (isRoomCreator) {
        return (
          <>
            <VideoTile 
              participantData={otherParticipants[0]} 
              className="main-video" 
              isMain={true}
            />
            {localParticipant && (
              <VideoTile 
                participantData={localParticipant} 
                className="preview-video" 
                isMain={false}
              />
            )}
          </>
        );
      } else {
        return (
          <>
            {localParticipant && (
              <VideoTile 
                participantData={localParticipant} 
                className="main-video" 
                isMain={true}
              />
            )}
            <VideoTile 
              participantData={otherParticipants[0]} 
              className="preview-video" 
              isMain={false}
            />
          </>
        );
      }
    } else if (participantCount === 3) {
      if (isRoomCreator) {
        return (
          <>
            <div className="participants-grid">
              {otherParticipants.map((participantData, index) => (
                <VideoTile 
                  key={participantData.participant.identity}
                  participantData={participantData} 
                  className="half-screen-video" 
                  isMain={true}
                />
              ))}
            </div>
            {localParticipant && (
              <VideoTile 
                participantData={localParticipant} 
                className="preview-video" 
                isMain={false}
              />
            )}
          </>
        );
      } else {
        return (
          <div className="participants-grid">
            {participants.map((participantData, index) => (
              <VideoTile 
                key={participantData.participant.identity}
                participantData={participantData} 
                className="half-screen-video" 
                isMain={true}
              />
            ))}
          </div>
        );
      }
    } else {
      // Deterministic mappings for common counts (1,2,3,4,6,9,12).
      // This ensures consistent UX and avoids fractional grid math variations.
      const count = participantCount;
      let cols = Math.max(1, Math.ceil(Math.sqrt(count)));
      let rows = Math.max(1, Math.ceil(count / cols));

      // Map exact layouts per your scenarios for better control
      switch (count) {
        case 1:
          cols = 1; rows = 1; break;
        case 2:
          cols = 2; rows = 1; break;
        case 3:
          cols = 2; rows = 2; break; // we'll center the bottom tile via CSS class
        case 4:
          cols = 2; rows = 2; break;
        case 6:
          cols = 3; rows = 2; break;
        case 9:
          cols = 3; rows = 3; break;
        case 12:
          cols = 4; rows = 3; break;
        default:
          cols = Math.max(1, Math.ceil(Math.sqrt(count)));
          rows = Math.max(1, Math.ceil(count / cols));
      }

      return (
        <div
          className="participants-grid-grid"
          // @ts-ignore custom CSS properties
          style={{ ['--cols']: cols, ['--rows']: rows, ['--gap']: '0.5rem' } as React.CSSProperties}
        >
          {participants.map((participantData, idx) => {
            // for 3 participants, center the last tile on the bottom row
            const extraClass = (count === 3 && idx === 2) ? 'span-bottom' : '';
            return (
              <VideoTile
                key={participantData.participant.identity}
                participantData={participantData}
                className={`grid-video ${extraClass}`}
                isMain={false}
              />
            );
          })}
        </div>
      );
    }
  };

  if (!isConnected || isConnecting) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-zinc-900 text-white">
        {connectionError ? (
          <>
            <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">Connection Failed</h2>
            <p className="text-red-400 mb-4 text-center max-w-md">{connectionError}</p>
            <div className="text-sm text-zinc-400 mb-6 text-center max-w-lg">
              <p>To use this app, you need a LiveKit server running.</p>
              <p>Please check the setup instructions or contact your administrator.</p>
            </div>
            <div className="flex gap-2 mt-4">
              <Button 
                variant="outline" 
                onClick={retryConnection}
                className="flex-1"
              >
                Retry Connection ({retryCount})
              </Button>
              <Button 
                variant="outline" 
                onClick={onLeaveRoom}
                className="flex-1"
              >
                Back to Join Room
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="w-10 h-10 border-4 border-zinc-600 border-l-blue-500 rounded-full animate-spin mb-4"></div>
            <p className="text-lg">Connecting to room...</p>
            <p className="text-sm text-zinc-400 mt-2">Setting up your video conference...</p>
            <p className="text-xs text-zinc-500 mt-2">Please wait while we establish the connection...</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-900">
      <div className="flex justify-between items-center p-4 bg-black/80 backdrop-blur-sm border-b border-white/10 z-10">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-white">Room: {roomName}</h2>
            <div className="flex items-center gap-1">
              <div className={cn(
                "w-2 h-2 rounded-full",
                isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
              )}></div>
              <span className={cn(
                "text-xs",
                isConnected ? "text-green-400" : "text-red-400"
              )}>
                {isConnected ? "Connected" : "Disconnected"}
              </span>
              <span className="text-xs text-zinc-500 ml-2">
                ({liveKitManagerRef.current?.getConnectionState()})
              </span>
              {connectionAttempts > 0 && (
                <span className="text-xs text-yellow-400 ml-2">
                  (Attempts: {connectionAttempts})
                </span>
              )}
            </div>
          </div>
          <span className="text-sm text-zinc-400">{participants.length} participant{participants.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={debugConnection}
            className="bg-blue-500/20 border-blue-500/30 text-blue-400 hover:bg-blue-500/30"
          >
            Debug
          </Button>
          <Button 
            variant="outline"
            onClick={refreshTracks}
            className="bg-green-500/20 border-green-500/30 text-green-400 hover:bg-green-500/30"
          >
            Refresh
          </Button>
          <Button 
            variant="outline"
            onClick={enableCameraAndMic}
            className="bg-purple-500/20 border-purple-500/30 text-purple-400 hover:bg-purple-500/30"
          >
            Enable
          </Button>
          <Button 
            variant="outline"
            onClick={forceReconnect}
            className="bg-orange-500/20 border-orange-500/30 text-orange-400 hover:bg-orange-500/30"
          >
            Reconnect
          </Button>
          <Button 
            variant="outline"
            onClick={() => setShowShareModal(true)}
            className="bg-white/10 border-white/30 text-white hover:bg-white/20"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="mr-2">
              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
            </svg>
            Share
          </Button>
          <Button 
            variant="destructive"
            onClick={onLeaveRoom}
          >
            Leave Room
          </Button>
        </div>
      </div>

      <div className={cn('video-container', getLayoutClass())}>
        {getVideoTiles()}
      </div>

      <RoomControls
        isMuted={isMuted}
        isCameraOn={isCameraOn}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
        onToggleScreenShare={toggleScreenShare}
        onLeaveRoom={onLeaveRoom}
      />

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-white mb-4">Share Room</h3>
            <p className="text-zinc-400 mb-4">
              Share this link with others to invite them to join the room:
            </p>
            <div className="bg-zinc-700 rounded p-3 mb-4">
              <code className="text-green-400 text-sm break-all">
                {generateRoomLink()}
              </code>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={copyRoomLink}
                className="flex-1"
              >
                Copy Link
              </Button>
              <Button 
                variant="outline"
                onClick={() => setShowShareModal(false)}
                className="flex-1"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Room;
