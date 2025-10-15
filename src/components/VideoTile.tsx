import React, { useRef, useEffect } from 'react';
import { cn } from '../lib/utils';
import { ParticipantData } from '../lib/livekit';

interface VideoTileProps {
  participantData: ParticipantData;
  className?: string;
  isMain?: boolean;
}

const VideoTile: React.FC<VideoTileProps> = ({ participantData, className, isMain = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    console.log('VideoTile useEffect:', {
      participant: participantData.participant.identity,
      hasVideoTrack: !!participantData.videoTrack,
      isCameraOn: participantData.isCameraOn,
      videoElement: !!videoRef.current,
      trackKind: participantData.videoTrack?.kind,
      trackEnabled: (participantData.videoTrack as any)?.enabled
    });

    // Attach video track to video element
    if (participantData.videoTrack && videoRef.current) {
      console.log('Attaching video track to element');
      try {
        participantData.videoTrack.attach(videoRef.current);
        console.log('Video track attached successfully');
      } catch (error) {
        console.error('Failed to attach video track:', error);
      }
    } else {
      console.log('Cannot attach video track:', {
        hasTrack: !!participantData.videoTrack,
        hasElement: !!videoRef.current
      });
    }

    // Attach audio track to audio element
    if (participantData.audioTrack && audioRef.current) {
      try {
        participantData.audioTrack.attach(audioRef.current);
        console.log('Audio track attached successfully');
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
    };
  }, [participantData.videoTrack, participantData.audioTrack, participantData.isCameraOn]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

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
            {participantData.isCameraOn && (
              <div className="camera-loading">
                <div className="loading-spinner"></div>
                <span>Starting camera...</span>
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
