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
  const [layoutMode, setLayoutMode] = useState<'gallery' | 'speaker'>('gallery');
  const [audioLevels, setAudioLevels] = useState<Record<string, number>>({});
  const [dominantSpeaker, setDominantSpeaker] = useState<string | null>(null);
  const [isTogglingCamera, setIsTogglingCamera] = useState(false);
  const [isTogglingMicrophone, setIsTogglingMicrophone] = useState(false);
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
              // Only attempt reconnection if we haven't exceeded max attempts
              if (connectionAttempts < 2) { // Reduced from 3 to 2
                setTimeout(() => {
                  if (liveKitManagerRef.current && !liveKitManagerRef.current.isConnected()) {
                    console.log('Attempting automatic reconnection...');
                    retryConnection();
                  }
                }, 8000); // Increased delay to prevent aggressive reconnection
              } else {
                console.log('Max reconnection attempts reached, stopping automatic reconnection');
              }
            } else {
              // When reconnected, only restore camera if it was actually on before disconnection
              setTimeout(() => {
                if (liveKitManagerRef.current) {
                  const trackedCameraState = liveKitManagerRef.current.getCameraState();
                  
                  // Only restore if camera was actually on before disconnection
                  if (trackedCameraState) {
                    console.log('Restoring camera after reconnection...', { 
                      trackedCameraState, 
                      uiState: isCameraOn
                    });
                    
                    // Update UI state to match
                    setIsCameraOn(true);
                    
                    // Let the LiveKit manager handle the actual restoration
                    liveKitManagerRef.current.forceCameraRestoration();
                  } else {
                    // Camera was off, just refresh tracks without forcing camera on
                    liveKitManagerRef.current.refreshVideoTracks();
                  }
                }
              }, 3000); // Reduced delay for faster restoration
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
        
        // Set initial camera state based on UI state
        manager.setCameraState(isCameraOn);
        
        // Don't start with camera on by default to prevent auto-disable issues
        if (isCameraOn) {
          console.log('Initial camera state is on, but will wait for user to explicitly enable');
          setIsCameraOn(false);
        }
        
        // Handle page refresh - preserve connection state
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
          console.log('Page is being refreshed, preserving connection state');
          if (liveKitManagerRef.current) {
            // Store connection state in sessionStorage
            sessionStorage.setItem('livekit-connection-state', JSON.stringify({
              roomName,
              participantName,
              isRoomCreator,
              isConnected: liveKitManagerRef.current.isConnected(),
              timestamp: Date.now()
            }));
            
            // Store camera and microphone state
            const localParticipant = participants.find(p => p.isLocal);
            if (localParticipant) {
              sessionStorage.setItem('livekit-media-state', JSON.stringify({
                isCameraOn: localParticipant.isCameraOn,
                isMuted: localParticipant.isMuted,
                timestamp: Date.now()
              }));
            }
          }
        };
        
        window.addEventListener('beforeunload', handleBeforeUnload);
        
        // Check for existing connection state on page load and restore if recent
        const savedState = sessionStorage.getItem('livekit-connection-state');
        const savedMediaState = sessionStorage.getItem('livekit-media-state');
        
        if (savedState) {
          try {
            const state = JSON.parse(savedState);
            const mediaState = savedMediaState ? JSON.parse(savedMediaState) : null;
            
            // Only restore if it's the same room/participant and connection was recent (within 30 seconds)
            const isRecentConnection = state.timestamp && (Date.now() - state.timestamp) < 30000;
            
            if (state.roomName === roomName && state.participantName === participantName && isRecentConnection) {
              console.log('Restoring connection state from session storage');
              
              // Restore media state after connection is established
              if (mediaState) {
                setTimeout(() => {
                  if (mediaState.isCameraOn && !isCameraOn) {
                    console.log('Restoring camera state after page refresh');
                    toggleCamera();
                  }
                  if (!mediaState.isMuted && isMuted) {
                    console.log('Restoring microphone state after page refresh');
                    toggleMute();
                  }
                }, 2000); // Wait for connection to be fully established
              }
            } else {
              // Clear old state
              sessionStorage.removeItem('livekit-connection-state');
              sessionStorage.removeItem('livekit-media-state');
            }
          } catch (error) {
            console.error('Failed to parse saved connection state:', error);
            sessionStorage.removeItem('livekit-connection-state');
            sessionStorage.removeItem('livekit-media-state');
          }
        }
        
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
    if (!liveKitManagerRef.current) {
      console.warn('LiveKit manager not initialized');
      return;
    }

    if (isTogglingMicrophone) {
      console.warn('Microphone toggle already in progress');
      return;
    }

    try {
      setIsTogglingMicrophone(true);
      
      // Check connection state before attempting to toggle
      const connectionInfo = liveKitManagerRef.current.getConnectionInfo();
      console.log('Current connection info:', connectionInfo);
      
      if (!connectionInfo.isConnected) {
        console.warn('Room not connected, cannot toggle microphone');
        console.log('Please wait for connection to be established before toggling microphone');
        return;
      }
      
      // Show loading state
      const originalMuteState = isMuted;
      
      await liveKitManagerRef.current.toggleMicrophone();
      
      // Update local state immediately for better UX
      setIsMuted(!originalMuteState);
      
    } catch (error) {
      console.error('Failed to toggle microphone:', error);
      
      // Show user-friendly error message
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          console.log('Microphone toggle timed out - this is usually due to connection issues');
        } else if (error.message.includes('not connected')) {
          console.log('Room is not connected - will retry when connection is restored');
        } else {
          console.log(`Microphone toggle failed: ${error.message}`);
        }
      } else {
        console.log('Microphone toggle failed with unknown error');
      }
    } finally {
      setIsTogglingMicrophone(false);
    }
  };

  const toggleCamera = async () => {
    if (!liveKitManagerRef.current) {
      console.warn('LiveKit manager not initialized');
      return;
    }

    if (isTogglingCamera) {
      console.warn('Camera toggle already in progress');
      return;
    }

    try {
      setIsTogglingCamera(true);
      
      // Check connection state before attempting to toggle
      const connectionInfo = liveKitManagerRef.current.getConnectionInfo();
      console.log('Current connection info:', connectionInfo);
      
      if (!connectionInfo.isConnected) {
        console.warn('Room not connected, cannot toggle camera');
        console.log('Please wait for connection to be established before toggling camera');
        return;
      }
      
      // Show loading state
      const originalCameraState = isCameraOn;
      
      await liveKitManagerRef.current.toggleCamera();
      
      // Update local state immediately for better UX
      setIsCameraOn(!originalCameraState);
      
    } catch (error) {
      console.error('Failed to toggle camera:', error);
      
      // Show user-friendly error message
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          console.log('Camera toggle timed out - this is usually due to connection issues');
        } else if (error.message.includes('not connected')) {
          console.log('Room is not connected - will retry when connection is restored');
        } else if (error.message.includes('publishing rejected')) {
          console.log('Camera toggle failed due to connection issues - will retry when connection is stable');
        } else {
          console.log(`Camera toggle failed: ${error.message}`);
        }
      } else {
        console.log('Camera toggle failed with unknown error');
      }
    } finally {
      setIsTogglingCamera(false);
    }
  };

  const onAudioLevel = (identity: string, level: number) => {
    // smooth levels with exponential moving average
    setAudioLevels(prev => {
      const prevLevel = prev[identity] ?? 0;
      const smoothed = prevLevel * 0.8 + level * 0.2;
      const next = { ...prev, [identity]: smoothed };
      // compute dominant speaker (simple: highest smoothed level above threshold)
      const entries = Object.entries(next);
      let maxId: string | null = null;
      let maxVal = 0.01; // threshold
      for (const [id, v] of entries) {
        if (v > maxVal) { maxVal = v; maxId = id; }
      }
      setDominantSpeaker(maxId);
      return next;
    });
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
      liveKitManagerRef.current.refreshAllParticipantTracks();
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
      // Don't disconnect existing connection - let LiveKit handle reconnection
      // This preserves existing participants and their state
      if (liveKitManagerRef.current) {
        console.log('Attempting to reconnect using existing manager...');
        
        // Try to reconnect with existing manager first
        const config = {
          serverUrl: LIVEKIT_CONFIG.serverUrl,
          token: await LIVEKIT_CONFIG.generateToken(roomName, participantName),
        };
        
        // Use the existing manager's reconnect method if available
        if (typeof liveKitManagerRef.current.reconnect === 'function') {
          await liveKitManagerRef.current.reconnect(config);
        } else {
          // Fallback: create new manager but preserve existing participants
          const existingParticipants = liveKitManagerRef.current.preserveParticipants();
          console.log('Preserving existing participants:', existingParticipants.length);
          
          // Disconnect old manager
          await liveKitManagerRef.current.disconnect();
          
          // Create new manager
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
          await manager.connect(config, roomName, participantName, isRoomCreator);
          
          // Restore existing participants after connection
          setTimeout(() => {
            if (existingParticipants.length > 0) {
              manager.restoreParticipants(existingParticipants);
            }
          }, 2000);
        }
      } else {
        // No existing manager, create new one
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
      }
      
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

      // Speaker mode: if enabled and we have a dominant speaker, promote them
      if (layoutMode === 'speaker' && dominantSpeaker) {
        const main = participants.find(p => p.participant.identity === dominantSpeaker) || participants[0];
        const others = participants.filter(p => p.participant.identity !== main.participant.identity);
        return (
          <div className="speaker-view flex-1 flex flex-col">
            <div className="speaker-main flex-1">
              <VideoTile participantData={main} className="main-video" isMain={true} onAudioLevel={onAudioLevel} />
            </div>
            <div className="speaker-others" style={{height: '33%'}}>
              <div className="participants-grid-grid" style={{ ['--cols']: Math.max(1, Math.ceil(Math.sqrt(others.length))), ['--rows']: 1 } as React.CSSProperties}>
                {others.map(o => (
                  <VideoTile key={o.participant.identity} participantData={o} className="grid-video" isMain={false} onAudioLevel={onAudioLevel} />
                ))}
              </div>
            </div>
          </div>
        );
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
                onAudioLevel={onAudioLevel}
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
            variant="outline"
            onClick={() => setLayoutMode(prev => prev === 'gallery' ? 'speaker' : 'gallery')}
            className="bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20"
          >
            {layoutMode === 'gallery' ? 'Speaker View' : 'Gallery View'}
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
        isTogglingMicrophone={isTogglingMicrophone}
        isTogglingCamera={isTogglingCamera}
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
