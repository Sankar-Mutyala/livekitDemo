import React, { useRef, useEffect, useCallback } from 'react';
import { cn } from '../lib/utils';
import { ParticipantData } from '../lib/livekit';

interface VideoTileProps {
  participantData: ParticipantData;
  className?: string;
  isMain?: boolean;
  onAudioLevel?: (identity: string, level: number) => void;
}

// Global AudioContext to prevent multiple contexts
let globalAudioContext: AudioContext | null = null;
const getGlobalAudioContext = () => {
  if (!globalAudioContext) {
    globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return globalAudioContext;
};

const VideoTile: React.FC<VideoTileProps> = ({ participantData, className, isMain = false, onAudioLevel }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null>(null);
  const isAttachedRef = useRef<boolean>(false);

  // Stable callback for audio level reporting
  const handleAudioLevel = useCallback((level: number) => {
    if (typeof onAudioLevel === 'function') {
      onAudioLevel(participantData.participant.identity, level);
    }
  }, [onAudioLevel, participantData.participant.identity]);

  // Cleanup function
  const cleanup = useCallback(() => {
    // Stop animation frame
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // Disconnect analyser
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      analyserRef.current = null;
    }

    // Disconnect source node
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      sourceNodeRef.current = null;
    }

    isAttachedRef.current = false;
  }, []);

  // Setup audio analyser
  const setupAudioAnalyser = useCallback(() => {
    if (!audioRef.current || !onAudioLevel || analyserRef.current || isAttachedRef.current) {
      return;
    }

    // Additional check to prevent multiple connections
    if (audioRef.current.srcObject && audioRef.current.srcObject instanceof MediaStream) {
      // For MediaStream, we can safely create a new source each time
    } else if (audioRef.current.src) {
      // For regular audio sources, check if already connected
      try {
        const audioCtx = getGlobalAudioContext();
        // This will throw if the element is already connected
        audioCtx.createMediaElementSource(audioRef.current);
      } catch (e) {
        console.warn('Audio element already connected to AudioContext, skipping analyser setup');
        return;
      }
    }

    try {
      const audioCtx = getGlobalAudioContext();
      
      // Check if audio element is already connected and not already attached
      if ((audioRef.current.srcObject || audioRef.current.src) && !isAttachedRef.current) {
        let source;
        
        // Use MediaStreamAudioSourceNode if we have a MediaStream, otherwise use MediaElementAudioSourceNode
        if (audioRef.current.srcObject && audioRef.current.srcObject instanceof MediaStream) {
          source = audioCtx.createMediaStreamSource(audioRef.current.srcObject);
        } else {
          source = audioCtx.createMediaElementSource(audioRef.current);
        }
        
        const analyser = audioCtx.createAnalyser();
        
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        
        source.connect(analyser);
        analyser.connect(audioCtx.destination);
        
        analyserRef.current = analyser;
        sourceNodeRef.current = source;
        isAttachedRef.current = true;

        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!analyserRef.current) return;
          
          try {
            analyserRef.current.getByteFrequencyData(data);
            
            // Compute RMS (Root Mean Square) for better audio level detection
            let sum = 0;
            for (let i = 0; i < data.length; i++) {
              const v = data[i] / 255;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / data.length);
            
            // Apply smoothing and report level
            handleAudioLevel(Math.min(rms * 2, 1)); // Amplify and cap at 1
          } catch (e) {
            // Ignore errors during cleanup
          }
          
          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      }
    } catch (e) {
      console.warn('Failed to create audio analyser:', e);
    }
  }, [onAudioLevel, handleAudioLevel]);

  useEffect(() => {
    console.log('VideoTile useEffect:', {
      participant: participantData.participant.identity,
      hasVideoTrack: !!participantData.videoTrack,
      isCameraOn: participantData.isCameraOn,
      videoElement: !!videoRef.current,
      trackKind: participantData.videoTrack?.kind,
      trackEnabled: (participantData.videoTrack as any)?.enabled
    });

    // Cleanup previous attachments
    cleanup();

    // Attach video track to video element with improved retry logic
    if (participantData.videoTrack && videoRef.current && participantData.isCameraOn) {
      console.log('Attaching video track to element');
      
      const attachVideoTrack = () => {
        try {
          // Only detach if we have a different track
          if (videoRef.current?.srcObject && videoRef.current.srcObject !== participantData.videoTrack?.mediaStream) {
            videoRef.current.srcObject = null;
          }
          
          // Attach the new track
          participantData.videoTrack!.attach(videoRef.current!);
          console.log('Video track attached successfully');
          isAttachedRef.current = true;
        } catch (error) {
          console.error('Failed to attach video track:', error);
          isAttachedRef.current = false;
          
          // Retry attachment with exponential backoff
          let retryCount = 0;
          const maxRetries = 3;
          
          const retryAttachment = () => {
            if (retryCount < maxRetries && participantData.videoTrack && videoRef.current && !isAttachedRef.current && participantData.isCameraOn) {
              retryCount++;
              console.log(`Retrying video track attachment (attempt ${retryCount}/${maxRetries})...`);
              setTimeout(() => {
                try {
                  participantData.videoTrack!.attach(videoRef.current!);
                  isAttachedRef.current = true;
                  console.log('Video track attached successfully on retry');
                } catch (retryError) {
                  console.error(`Retry ${retryCount} failed:`, retryError);
                  if (retryCount < maxRetries) {
                    retryAttachment();
                  }
                }
              }, 1000 * retryCount); // Exponential backoff
            }
          };
          
          retryAttachment();
        }
      };
      
      attachVideoTrack();
    } else if (participantData.isCameraOn && !participantData.videoTrack) {
      // Camera is on but no track yet - this is normal during camera startup
      console.log('Camera is on but video track not ready yet - waiting for track to be published');
      isAttachedRef.current = false;
    } else {
      console.log('Cannot attach video track:', {
        hasTrack: !!participantData.videoTrack,
        hasElement: !!videoRef.current,
        isCameraOn: participantData.isCameraOn
      });
      isAttachedRef.current = false;
    }

    // Attach audio track to audio element
    if (participantData.audioTrack && audioRef.current) {
      try {
        participantData.audioTrack.attach(audioRef.current);
        console.log('Audio track attached successfully');
        
        // Setup audio analyser after a short delay to ensure track is ready
        setTimeout(() => {
          setupAudioAnalyser();
        }, 100);
      } catch (error) {
        console.error('Failed to attach audio track:', error);
      }
    }

    // Cleanup function
    return () => {
      if (participantData.videoTrack && videoRef.current) {
        try {
          participantData.videoTrack.detach(videoRef.current);
        } catch (error) {
          console.error('Failed to detach video track:', error);
        }
      }
      if (participantData.audioTrack && audioRef.current) {
        try {
          participantData.audioTrack.detach(audioRef.current);
        } catch (error) {
          console.error('Failed to detach audio track:', error);
        }
      }
      cleanup();
    };
  }, [participantData.videoTrack, participantData.audioTrack, participantData.isCameraOn, setupAudioAnalyser, cleanup]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Improved video detection: show video if we have a track OR if camera is on (might be loading)
  const hasVideo = participantData.videoTrack && participantData.isCameraOn;
  const hasAudio = participantData.audioTrack && !participantData.isMuted;

  console.log('VideoTile render:', {
    participant: participantData.participant.identity,
    hasVideo,
    hasVideoTrack: !!participantData.videoTrack,
    isCameraOn: participantData.isCameraOn,
    isLocal: participantData.isLocal
  });

  return (
    <div className={cn('video-tile', className, { 'is-main': isMain })}>
      <div className="video-wrapper">
        {/* Show video if available and camera is on */}
        {hasVideo ? (
          <video
            ref={videoRef}
            className="video-element"
            autoPlay
            playsInline
            muted={participantData.isLocal}
            style={{ backgroundColor: '#000' }}
          />
        ) : (
          <div className="video-placeholder">
            <div className="participant-avatar">
              {getInitials(participantData.participant.identity)}
            </div>
            {participantData.isCameraOn && !participantData.videoTrack && (
              <div className="camera-loading">
                <div className="loading-spinner"></div>
                <span>Starting camera...</span>
              </div>
            )}
            {participantData.isCameraOn && participantData.videoTrack && (
              <div className="camera-loading">
                <div className="loading-spinner"></div>
                <span>Connecting video...</span>
              </div>
            )}
          </div>
        )}
        
        {/* Audio element for real implementation */}
        <audio
          ref={audioRef}
          autoPlay
          playsInline
        />
      </div>
      
      <div className="participant-info">
        <span className="participant-name">
          {participantData.participant.identity}
          {participantData.isLocal && ' (You)'}
        </span>
        <div className="participant-status">
          {participantData.isRoomCreator && (
            <span className="creator-badge">Host</span>
          )}
        </div>
      </div>
      
      {/* Video controls overlay */}
      <div className="video-controls-overlay">
        <div className="status-indicators">
          <div className={cn('mic-status', { 'muted': participantData.isMuted })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          </div>
          <div className={cn('camera-status', { 'off': !participantData.isCameraOn })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoTile;
