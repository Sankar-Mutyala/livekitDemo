import React, { useState } from 'react';
import Room from './components/Room';
import RoomJoin from './components/RoomJoin';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  const [roomName, setRoomName] = useState<string>('');
  const [participantName, setParticipantName] = useState<string>('');
  const [isInRoom, setIsInRoom] = useState<boolean>(false);
  const [isRoomCreator, setIsRoomCreator] = useState<boolean>(false);

  const joinRoom = (room: string, name: string, creator: boolean = false) => {
    setRoomName(room);
    setParticipantName(name);
    setIsRoomCreator(creator);
    setIsInRoom(true);
  };

  const leaveRoom = () => {
    setIsInRoom(false);
    setRoomName('');
    setParticipantName('');
    setIsRoomCreator(false);
  };

  return (
    <div className="App">
      <ErrorBoundary>
        {!isInRoom ? (
          <RoomJoin onJoinRoom={joinRoom} />
        ) : (
          <Room
            roomName={roomName}
            participantName={participantName}
            isRoomCreator={isRoomCreator}
            onLeaveRoom={leaveRoom}
          />
        )}
      </ErrorBoundary>
    </div>
  );
}

export default App;
