import React from 'react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

interface RoomControlsProps {
  isMuted: boolean;
  isCameraOn: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare?: () => void;
  onLeaveRoom: () => void;
  isTogglingMicrophone?: boolean;
  isTogglingCamera?: boolean;
}

const RoomControls: React.FC<RoomControlsProps> = ({
  isMuted,
  isCameraOn,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onLeaveRoom,
  isTogglingMicrophone = false,
  isTogglingCamera = false,
}) => {
  return (
    <div className="room-controls">
      <div className="control-buttons">
        <Button
          size="icon"
          variant="ghost"
          className={cn('control-button', { 'active': !isMuted })}
          onClick={onToggleMute}
          disabled={isTogglingMicrophone}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isTogglingMicrophone ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              {isMuted ? (
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
              ) : (
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              )}
            </svg>
          )}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className={cn('control-button', { 'active': isCameraOn })}
          onClick={onToggleCamera}
          disabled={isTogglingCamera}
          title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {isTogglingCamera ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              {isCameraOn ? (
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
              ) : (
                <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.55-.18L19.73 21 21 19.73 3.27 2zM5 16V8h1.73l8 8H5z"/>
              )}
            </svg>
          )}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="control-button"
          onClick={onToggleScreenShare}
          title="Share screen"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
          </svg>
        </Button>

        <Button
          size="icon"
          variant="destructive"
          className="control-button leave-button"
          onClick={onLeaveRoom}
          title="Leave room"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 17v-3H9v-4h7V7l5 5-5 5z"/>
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H6V4h8v16z"/>
          </svg>
        </Button>
      </div>
    </div>
  );
};

export default RoomControls;
