import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface RoomJoinProps {
  onJoinRoom: (room: string, name: string, creator: boolean) => void;
}

const RoomJoin: React.FC<RoomJoinProps> = ({ onJoinRoom }) => {
  const [roomName, setRoomName] = useState('');
  const [participantName, setParticipantName] = useState('');

  // Check for room parameter in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
      setRoomName(decodeURIComponent(roomFromUrl));
    }
  }, []);

  const handleJoin = (isCreator: boolean) => {
    if (roomName.trim() && participantName.trim()) {
      onJoinRoom(roomName.trim(), participantName.trim(), isCreator);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-8">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-bold text-white text-center mb-8">
          LiveKit Video Conference
        </h1>
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20">
          <div className="space-y-4">
            <Input
              type="text"
              placeholder="Enter your name"
              value={participantName}
              onChange={(e) => setParticipantName(e.target.value)}
              className="bg-white/90 text-gray-900 placeholder:text-gray-600"
            />
            <Input
              type="text"
              placeholder="Enter room name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="bg-white/90 text-gray-900 placeholder:text-gray-600"
            />
            <div className="flex gap-4 mt-6">
              <Button
                onClick={() => handleJoin(true)}
                className="flex-1 bg-primary hover:bg-primary/90"
              >
                Create Room
              </Button>
              <Button
                onClick={() => handleJoin(false)}
                variant="outline"
                className="flex-1 bg-white/20 border-white/30 text-white hover:bg-white/30"
              >
                Join Room
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoomJoin;
