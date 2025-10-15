import { Room, RoomEvent, Track, RemoteParticipant, LocalParticipant, LocalTrack, RemoteTrack, TrackPublication } from 'livekit-client';

export interface LiveKitConfig {
  serverUrl: string;
  token: string;
}

export interface ParticipantData {
  participant: LocalParticipant | RemoteParticipant;
  isLocal: boolean;
  isRoomCreator: boolean;
  videoTrack?: LocalTrack | RemoteTrack;
  audioTrack?: LocalTrack | RemoteTrack;
  isMuted: boolean;
  isCameraOn: boolean;
}

export class LiveKitManager {
  private room: Room | null = null;
  private participants: Map<string, ParticipantData> = new Map();
  private onParticipantsChange?: (participants: ParticipantData[]) => void;
  private onConnectionChange?: (connected: boolean) => void;

  constructor(
    onParticipantsChange?: (participants: ParticipantData[]) => void,
    onConnectionChange?: (connected: boolean) => void
  ) {
    this.onParticipantsChange = onParticipantsChange;
    this.onConnectionChange = onConnectionChange;
  }

  async connect(config: LiveKitConfig, roomName: string, participantName: string, isRoomCreator: boolean = false): Promise<void> {
    try {
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: {
          videoSimulcastLayers: [
            { width: 320, height: 240, resolution: { width: 320, height: 240 }, encoding: { maxBitrate: 200_000 } },
            { width: 640, height: 480, resolution: { width: 640, height: 480 }, encoding: { maxBitrate: 500_000 } },
            { width: 1280, height: 720, resolution: { width: 1280, height: 720 }, encoding: { maxBitrate: 1_000_000 } },
          ],
        },
      });

      // Set up event listeners
      this.setupEventListeners();

      // Connect to room
      await this.room.connect(config.serverUrl, config.token);

      // Wait for room to be fully connected
      await this.waitForConnection();

      // Add local participant
      this.addParticipant(this.room.localParticipant, true, isRoomCreator);

      // Connection state will be updated via RoomEvent.Connected
    } catch (error) {
      console.error('Failed to connect to LiveKit room:', error);
      throw error;
    }
  }

  async enableCameraAndMicrophone(): Promise<void> {
    if (!this.room || this.room.state !== 'connected') {
      console.error('Room not connected, cannot enable camera and microphone');
      return;
    }

    try {
      console.log('Enabling camera and microphone...');
      await this.room.localParticipant.enableCameraAndMicrophone();
      console.log('Camera and microphone enabled successfully');
      
      // Refresh tracks after enabling
      setTimeout(() => {
        this.refreshVideoTracks();
      }, 1000);
    } catch (error) {
      console.error('Failed to enable camera and microphone:', error);
      throw error;
    }
  }

  private async waitForConnection(): Promise<void> {
    if (!this.room) return;
    
    console.log('Waiting for room connection...');
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max wait
    
    // Wait for room to be connected
    while (this.room.state !== 'connected' && attempts < maxAttempts) {
      console.log(`Connection attempt ${attempts + 1}, current state: ${this.room.state}`);
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (this.room.state !== 'connected') {
      throw new Error(`Failed to connect to room. Final state: ${this.room.state}`);
    }
    
    console.log('Room connected successfully!');
    
    // Additional wait to ensure everything is ready
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  private setupEventListeners(): void {
    if (!this.room) return;

    this.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      this.addParticipant(participant, false, false);
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      this.removeParticipant(participant.identity);
    });

    this.room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: TrackPublication, participant: RemoteParticipant) => {
      console.log('Track subscribed:', track.kind, 'for participant:', participant.identity);
      this.updateParticipantTrack(participant.identity, track);
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: TrackPublication, participant: RemoteParticipant) => {
      console.log('Track unsubscribed:', track.kind, 'for participant:', participant.identity);
      this.removeParticipantTrack(participant.identity, track.kind);
    });

    // Listen for local track publications
    this.room.on(RoomEvent.LocalTrackPublished, (publication: TrackPublication) => {
      console.log('Local track published:', publication.kind);
      if (publication.track) {
        this.updateParticipantTrack(this.room!.localParticipant.identity, publication.track as LocalTrack);
      }
    });

    this.room.on(RoomEvent.LocalTrackUnpublished, (publication: TrackPublication) => {
      console.log('Local track unpublished:', publication.kind);
      this.removeParticipantTrack(this.room!.localParticipant.identity, publication.kind);
    });

    this.room.on(RoomEvent.TrackMuted, (publication: TrackPublication, participant: any) => {
      this.updateParticipantMuteStatus(participant.identity, publication.kind, true);
    });

    this.room.on(RoomEvent.TrackUnmuted, (publication: TrackPublication, participant: any) => {
      this.updateParticipantMuteStatus(participant.identity, publication.kind, false);
    });

    this.room.on(RoomEvent.Disconnected, (reason) => {
      console.log('Room disconnected, reason:', reason);
      this.onConnectionChange?.(false);
    });

    this.room.on(RoomEvent.Connected, () => {
      console.log('Room connected event received');
      this.onConnectionChange?.(true);
    });

    this.room.on(RoomEvent.Reconnecting, () => {
      console.log('Room reconnecting...');
      this.onConnectionChange?.(false);
    });

    this.room.on(RoomEvent.ConnectionStateChanged, (state) => {
      console.log('Connection state changed to:', state);
      this.onConnectionChange?.(state === 'connected');
    });
  }

  private addParticipant(participant: LocalParticipant | RemoteParticipant, isLocal: boolean, isRoomCreator: boolean): void {
    const participantData: ParticipantData = {
      participant,
      isLocal,
      isRoomCreator,
      isMuted: !participant.isMicrophoneEnabled,
      isCameraOn: participant.isCameraEnabled,
    };

    // Get video and audio tracks
    const videoTrack = (participant as any).videoTracks?.values().next().value?.track;
    const audioTrack = (participant as any).audioTracks?.values().next().value?.track;

    if (videoTrack) {
      participantData.videoTrack = videoTrack;
    }
    if (audioTrack) {
      participantData.audioTrack = audioTrack;
    }

    this.participants.set(participant.identity, participantData);
    this.notifyParticipantsChange();
  }

  private removeParticipant(identity: string): void {
    this.participants.delete(identity);
    this.notifyParticipantsChange();
  }

  private updateParticipantTrack(identity: string, track: LocalTrack | RemoteTrack): void {
    const participantData = this.participants.get(identity);
    if (participantData) {
      if (track.kind === Track.Kind.Video) {
        participantData.videoTrack = track;
      } else if (track.kind === Track.Kind.Audio) {
        participantData.audioTrack = track;
      }
      this.notifyParticipantsChange();
    }
  }

  private removeParticipantTrack(identity: string, kind: Track.Kind): void {
    const participantData = this.participants.get(identity);
    if (participantData) {
      if (kind === Track.Kind.Video) {
        participantData.videoTrack = undefined;
      } else if (kind === Track.Kind.Audio) {
        participantData.audioTrack = undefined;
      }
      this.notifyParticipantsChange();
    }
  }

  private updateParticipantMuteStatus(identity: string, kind: Track.Kind, muted: boolean): void {
    const participantData = this.participants.get(identity);
    if (participantData) {
      if (kind === Track.Kind.Audio) {
        participantData.isMuted = muted;
      } else if (kind === Track.Kind.Video) {
        participantData.isCameraOn = !muted;
      }
      this.notifyParticipantsChange();
    }
  }

  private notifyParticipantsChange(): void {
    this.onParticipantsChange?.(Array.from(this.participants.values()));
  }

  async toggleMicrophone(): Promise<void> {
    if (!this.room) {
      console.error('Room is null, cannot toggle microphone');
      return;
    }
    
    if (this.room.state !== 'connected') {
      console.error(`Room not connected (state: ${this.room.state}), cannot toggle microphone`);
      return;
    }
    
    try {
      const isEnabled = this.room.localParticipant.isMicrophoneEnabled;
      console.log(`Toggling microphone from ${isEnabled} to ${!isEnabled}`);
      
      await this.room.localParticipant.setMicrophoneEnabled(!isEnabled);
      console.log('Microphone toggled successfully');
    } catch (error) {
      console.error('Failed to toggle microphone:', error);
      throw error;
    }
  }

  async toggleCamera(): Promise<void> {
    if (!this.room) {
      console.error('Room is null, cannot toggle camera');
      return;
    }
    
    if (this.room.state !== 'connected') {
      console.error(`Room not connected (state: ${this.room.state}), cannot toggle camera`);
      return;
    }
    
    try {
      const isEnabled = this.room.localParticipant.isCameraEnabled;
      console.log(`Toggling camera from ${isEnabled} to ${!isEnabled}`);
      
      await this.room.localParticipant.setCameraEnabled(!isEnabled);
      console.log('Camera toggled successfully');
      
      // Wait for track to be published and then refresh
      setTimeout(() => {
        console.log('Refreshing tracks after camera toggle...');
        this.refreshVideoTracks();
      }, 1000);
      
      // Also refresh again after a longer delay to catch delayed track publications
      setTimeout(() => {
        console.log('Second refresh after camera toggle...');
        this.refreshVideoTracks();
      }, 2000);
    } catch (error) {
      console.error('Failed to toggle camera:', error);
      throw error;
    }
  }

  async toggleScreenShare(): Promise<void> {
    if (!this.room) return;
    try {
      const screenTracks = await this.room.localParticipant.createScreenTracks();
      if (screenTracks.length > 0) {
        await this.room.localParticipant.publishTrack(screenTracks[0]);
      }
    } catch (error) {
      console.error('Failed to start screen share:', error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
      this.participants.clear();
      this.onConnectionChange?.(false);
    }
  }

  getParticipants(): ParticipantData[] {
    return Array.from(this.participants.values());
  }

  isConnected(): boolean {
    return this.room?.state === 'connected';
  }

  getConnectionState(): string {
    return this.room?.state || 'disconnected';
  }

  getLocalParticipant(): LocalParticipant | null {
    return this.room?.localParticipant || null;
  }

  refreshVideoTracks(): void {
    if (!this.room) return;
    
    // Refresh local participant tracks
    const localParticipant = this.room.localParticipant;
    const participantData = this.participants.get(localParticipant.identity);
    
    if (participantData) {
      // Get current video and audio tracks from publications
      const videoPublications = Array.from(localParticipant.videoTrackPublications.values());
      const audioPublications = Array.from(localParticipant.audioTrackPublications.values());
      
      const videoTrack = videoPublications.find(pub => pub.track)?.track;
      const audioTrack = audioPublications.find(pub => pub.track)?.track;
      
      console.log('Refreshing tracks:', {
        hasVideoTrack: !!videoTrack,
        hasAudioTrack: !!audioTrack,
        isCameraOn: localParticipant.isCameraEnabled,
        isMicrophoneOn: localParticipant.isMicrophoneEnabled,
        videoPublications: videoPublications.length,
        audioPublications: audioPublications.length,
        videoTrackKind: videoTrack?.kind,
        audioTrackKind: audioTrack?.kind
      });
      
      if (videoTrack) {
        participantData.videoTrack = videoTrack;
        console.log('Video track attached to participant data');
      } else {
        participantData.videoTrack = undefined;
        console.log('No video track found');
      }
      
      if (audioTrack) {
        participantData.audioTrack = audioTrack;
        console.log('Audio track attached to participant data');
      } else {
        participantData.audioTrack = undefined;
        console.log('No audio track found');
      }
      
      this.notifyParticipantsChange();
    }
  }
}

// Helper function to generate a demo token (for development only)
export const generateDemoToken = (roomName: string, participantName: string): string => {
  // In production, you should generate tokens on your server
  // This is just for demo purposes
  return `demo-token-${roomName}-${participantName}`;
};
