import { Room, RoomEvent, Track, RemoteParticipant, LocalParticipant, LocalTrack, RemoteTrack, TrackPublication, ConnectionQuality, Participant } from 'livekit-client';
import { logger, PerformanceMonitor, connectionHealthMonitor } from './logger';

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
  private lastCameraState: boolean = false;
  private lastMicrophoneState: boolean = false;
  private restorationAttempts: number = 0;
  private maxRestorationAttempts: number = 5;

  constructor(
    onParticipantsChange?: (participants: ParticipantData[]) => void,
    onConnectionChange?: (connected: boolean) => void
  ) {
    this.onParticipantsChange = onParticipantsChange;
    this.onConnectionChange = onConnectionChange;
  }

  async connect(config: LiveKitConfig, roomName: string, participantName: string, isRoomCreator: boolean = false): Promise<void> {
    return PerformanceMonitor.measureAsync('livekit-connect', async () => {
      try {
        logger.info('Starting LiveKit connection', { roomName, participantName, isRoomCreator });
        
        // Clean up existing room if any
        if (this.room) {
          await this.disconnect();
        }

        this.room = new Room({
        // Enhanced connection settings for better stability
        reconnectPolicy: {
          nextRetryDelayInMs: (context) => {
            // More conservative exponential backoff with jitter
            const baseDelay = Math.min(3000 * Math.pow(1.8, context.retryCount), 20000);
            const jitter = Math.random() * 3000;
            return baseDelay + jitter;
          },
        },
        // Additional connection stability settings
        adaptiveStream: true,
        dynacast: true,
        // Enhanced publish defaults for better quality and reliability
        publishDefaults: {
          videoSimulcastLayers: [
            { width: 320, height: 240, resolution: { width: 320, height: 240 }, encoding: { maxBitrate: 150_000 } },
            { width: 640, height: 480, resolution: { width: 640, height: 480 }, encoding: { maxBitrate: 400_000 } },
            { width: 1280, height: 720, resolution: { width: 1280, height: 720 }, encoding: { maxBitrate: 800_000 } },
          ],
          videoCodec: 'h264',
          dtx: true, // Discontinuous transmission for better bandwidth usage
          red: true, // Redundancy for better audio quality
        },
      });

      // Set up event listeners
      this.setupEventListeners();

      // Connect to room with timeout
      const connectPromise = this.room.connect(config.serverUrl, config.token);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 45000); // Increased timeout
      });

      await Promise.race([connectPromise, timeoutPromise]);

      // Wait for room to be fully connected
      await this.waitForConnection();

      // Add local participant
      this.addParticipant(this.room.localParticipant, true, isRoomCreator);

        // Connection state will be updated via RoomEvent.Connected
        logger.info('LiveKit connection established successfully', { roomName, participantName });
        
        // Add health check for this connection
        connectionHealthMonitor.addHealthCheck('livekit-connection', () => {
          return Promise.resolve(this.room?.state === 'connected');
        });
        
        // Start connection stability monitoring
        this.handleConnectionStability();
        
      } catch (error) {
        logger.error('Failed to connect to LiveKit room', error as Error, { roomName, participantName });
        // Clean up on failure
        if (this.room) {
          try {
            await this.room.disconnect();
          } catch (e) {
            logger.warn('Error during cleanup', e as Error);
          }
          this.room = null;
        }
        throw error;
      }
    });
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
    const maxAttempts = 150; // 15 seconds max wait
    
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
    
    // Wait for engine to be fully ready
    await this.waitForEngineReady();
  }

  private async waitForEngineReady(): Promise<void> {
    if (!this.room) return;
    
    console.log('Waiting for engine to be ready...');
    let attempts = 0;
    const maxAttempts = 30; // 3 seconds max wait
    
    // Wait for engine to be ready
    while (attempts < maxAttempts) {
      try {
        // Check if we can access the engine
        const engine = (this.room as any).engine;
        if (engine && (engine.state === 'connected' || engine.state === 'connecting')) {
          console.log('Engine is ready!');
          break;
        }
      } catch (e) {
        // Engine not ready yet
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    // Reduced additional wait
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  private setupEventListeners(): void {
    if (!this.room) return;

    this.room.on(RoomEvent.ParticipantConnected, async (participant: RemoteParticipant) => {
      console.log('Remote participant connected:', participant.identity);
      this.addParticipant(participant, false, false);
      
      // Subscribe to existing tracks for this participant
      await this.subscribeToParticipantTracks(participant);
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      this.removeParticipant(participant.identity);
    });

    this.room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: TrackPublication, participant: RemoteParticipant) => {
      console.log('Track subscribed:', track.kind, 'for participant:', participant.identity);
      this.updateParticipantTrack(participant.identity, track);
    });

    // Listen for remote track publications
    this.room.on(RoomEvent.TrackPublished, async (publication: TrackPublication, participant: RemoteParticipant) => {
      console.log('Remote track published:', publication.kind, 'for participant:', participant.identity);
      
      // Track subscription should be handled automatically by LiveKit
      // We just need to ensure the track is properly attached when it becomes available
      console.log('Track published - subscription will be handled automatically by LiveKit');
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
      // Don't immediately remove the track - it might be due to connection issues
      // Only remove if the room is actually disconnected
      if (this.room?.state === 'disconnected') {
        this.removeParticipantTrack(this.room!.localParticipant.identity, publication.kind);
      }
    });

    // Add connection quality monitoring
    this.room.on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, participant: Participant) => {
      if (participant === this.room?.localParticipant) {
        console.log('Local participant connection quality:', quality);
        
        // If quality is poor, try to restore camera after a delay
        if (quality === ConnectionQuality.Poor && this.lastCameraState) {
          console.log('Poor connection quality detected, will attempt camera restoration');
          setTimeout(() => {
            if (this.room?.state === 'connected' && this.lastCameraState) {
              this.restoreCameraState();
            }
          }, 5000);
        }
        
        // If quality improves, refresh tracks
        if (quality === ConnectionQuality.Excellent || quality === ConnectionQuality.Good) {
          setTimeout(() => {
            this.refreshVideoTracksInternal();
          }, 1000);
        }
      }
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
      
      // Don't clear tracks immediately on disconnection - they might reconnect
      // Only clear tracks if it's a permanent disconnection
      if (reason && (reason.toString() === 'CLIENT_INITIATED' || reason.toString() === 'SERVER_SHUTDOWN')) {
        console.log('Permanent disconnection, clearing tracks');
        const localParticipant = this.room?.localParticipant;
        if (localParticipant) {
          this.removeParticipantTrack(localParticipant.identity, Track.Kind.Video);
          this.removeParticipantTrack(localParticipant.identity, Track.Kind.Audio);
        }
      } else {
        console.log('Temporary disconnection, preserving participant state');
      }
    });

    this.room.on(RoomEvent.Connected, () => {
      console.log('Room connected event received');
      this.onConnectionChange?.(true);
      
      // Refresh tracks after reconnection but don't clear existing participants
      setTimeout(() => {
        this.refreshVideoTracksInternal();
        // Restore camera state if it was on before disconnection
        this.restoreCameraState();
      }, 1000);
      
      // Additional restoration attempt
      setTimeout(() => {
        this.restoreCameraState();
      }, 3000);
    });

    this.room.on(RoomEvent.Reconnecting, () => {
      console.log('Room reconnecting...');
      this.onConnectionChange?.(false);
    });

    this.room.on(RoomEvent.ConnectionStateChanged, (state) => {
      console.log('Connection state changed to:', state);
      
      // Only notify connection change for 'connected' and 'disconnected' states
      // Skip intermediate states like 'connecting' and 'reconnecting'
      if (state === 'connected') {
        this.onConnectionChange?.(true);
        // If reconnected, refresh tracks and restore camera if needed
        setTimeout(() => {
          this.refreshVideoTracksInternal();
          // Restore camera after reconnection if it was previously enabled
          if (this.lastCameraState) {
            console.log('Restoring camera after reconnection...');
            setTimeout(() => {
              this.restoreCameraState();
            }, 2000);
          }
        }, 500);
      } else if (state === 'disconnected') {
        this.onConnectionChange?.(false);
        // Don't reset camera state on disconnect - preserve it for reconnection
        console.log('Connection disconnected - preserving camera state for reconnection');
      }
      // Don't notify for 'connecting' or 'reconnecting' states
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

    // Get video and audio tracks from publications
    const videoPublications: any[] = [];
    const audioPublications: any[] = [];
    
    // Use forEach to avoid iteration issues
    participant.videoTrackPublications.forEach((pub) => {
      videoPublications.push(pub);
    });
    participant.audioTrackPublications.forEach((pub) => {
      audioPublications.push(pub);
    });
    
    console.log('Adding participant:', participant.identity, {
      videoPublications: videoPublications.length,
      audioPublications: audioPublications.length,
      isLocal,
      isRoomCreator
    });
    
    const videoTrack = videoPublications.find(pub => pub.track)?.track;
    const audioTrack = audioPublications.find(pub => pub.track)?.track;

    if (videoTrack) {
      participantData.videoTrack = videoTrack;
      // For remote participants, if they have a video track, their camera is on
      if (!isLocal) {
        participantData.isCameraOn = true;
      }
      console.log('Video track found for participant:', participant.identity);
    } else {
      console.log('No video track found for participant:', participant.identity);
      // For remote participants, if no video track, camera is off
      if (!isLocal) {
        participantData.isCameraOn = false;
      }
    }
    
    if (audioTrack) {
      participantData.audioTrack = audioTrack;
      // For remote participants, if they have an audio track, they're not muted
      if (!isLocal) {
        participantData.isMuted = false;
      }
      console.log('Audio track found for participant:', participant.identity);
    } else {
      console.log('No audio track found for participant:', participant.identity);
      // For remote participants, if no audio track, they're muted
      if (!isLocal) {
        participantData.isMuted = true;
      }
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
        console.log(`Video track updated for ${identity}:`, {
          trackEnabled: (track as any).enabled,
          trackMuted: (track as any).muted,
          trackState: (track as any).state
        });
      } else if (track.kind === Track.Kind.Audio) {
        participantData.audioTrack = track;
        console.log(`Audio track updated for ${identity}:`, {
          trackEnabled: (track as any).enabled,
          trackMuted: (track as any).muted,
          trackState: (track as any).state
        });
      }
      
      // Update camera/microphone state based on track availability
      if (track.kind === Track.Kind.Video) {
        participantData.isCameraOn = !!track && (track as any).enabled !== false;
      } else if (track.kind === Track.Kind.Audio) {
        participantData.isMuted = !track || (track as any).muted === true;
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

  // Subscribe to all available tracks for a participant
  private async subscribeToParticipantTracks(participant: RemoteParticipant): Promise<void> {
    try {
      console.log('Subscribing to tracks for participant:', participant.identity);
      
      // Subscribe to video tracks
      const videoPublications = Array.from(participant.videoTrackPublications.values());
      console.log('Video publications for', participant.identity, ':', videoPublications.length);
      
      for (const publication of videoPublications) {
        console.log('Video publication status:', {
          isSubscribed: publication.isSubscribed,
          trackSid: publication.trackSid,
          kind: publication.kind
        });
      }
      
      // Subscribe to audio tracks
      const audioPublications = Array.from(participant.audioTrackPublications.values());
      console.log('Audio publications for', participant.identity, ':', audioPublications.length);
      
      for (const publication of audioPublications) {
        console.log('Audio publication status:', {
          isSubscribed: publication.isSubscribed,
          trackSid: publication.trackSid,
          kind: publication.kind
        });
      }
    } catch (error) {
      console.error('Failed to subscribe to participant tracks:', error);
    }
  }

  async toggleMicrophone(): Promise<void> {
    if (!this.room) {
      console.error('Room is null, cannot toggle microphone');
      throw new Error('Room not initialized');
    }
    
    if (this.room.state !== 'connected') {
      console.error(`Room not connected (state: ${this.room.state}), cannot toggle microphone`);
      throw new Error(`Room not connected (state: ${this.room.state})`);
    }
    
    try {
      const isEnabled = this.room.localParticipant.isMicrophoneEnabled;
      console.log(`Toggling microphone from ${isEnabled} to ${!isEnabled}`);
      
      // Update participant data immediately for better UX
      const participantData = this.participants.get(this.room.localParticipant.identity);
      if (participantData) {
        participantData.isMuted = !isEnabled;
        this.lastMicrophoneState = !isEnabled; // Track the microphone state
        this.notifyParticipantsChange();
      }
      
      // Simplified approach - just toggle without complex timeout handling
      await this.room.localParticipant.setMicrophoneEnabled(!isEnabled);
      console.log('Microphone toggled successfully');
      
      // No need to refresh tracks for microphone - it's just mute/unmute
      
    } catch (error) {
      console.error('Failed to toggle microphone:', error);
      // Revert UI state on error
      const participantData = this.participants.get(this.room.localParticipant.identity);
      if (participantData) {
        participantData.isMuted = this.room.localParticipant.isMicrophoneEnabled;
        this.notifyParticipantsChange();
      }
      throw error;
    }
  }

  async toggleCamera(): Promise<void> {
    if (!this.room) {
      console.error('Room is null, cannot toggle camera');
      throw new Error('Room not initialized');
    }
    
    if (this.room.state !== 'connected') {
      console.error(`Room not connected (state: ${this.room.state}), cannot toggle camera`);
      throw new Error(`Room not connected (state: ${this.room.state})`);
    }
    
    try {
      const isEnabled = this.room.localParticipant.isCameraEnabled;
      console.log(`Toggling camera from ${isEnabled} to ${!isEnabled}`);
      
      // Update participant data immediately for better UX
      const participantData = this.participants.get(this.room.localParticipant.identity);
      if (participantData) {
        participantData.isCameraOn = !isEnabled;
        this.lastCameraState = !isEnabled; // Track the camera state
        this.notifyParticipantsChange();
      }
      
      // Simplified approach - just toggle without complex timeout handling
      await this.room.localParticipant.setCameraEnabled(!isEnabled);
      console.log('Camera toggled successfully');
      
      // Only refresh tracks if camera is being turned ON (not off)
      if (!isEnabled) {
        // Wait for track to be published and then refresh
        setTimeout(() => {
          console.log('Refreshing tracks after camera toggle...');
          this.refreshVideoTracksInternal();
        }, 2000); // Increased delay to allow track to be published
      }
      
    } catch (error) {
      console.error('Failed to toggle camera:', error);
      // Revert UI state on error
      const participantData = this.participants.get(this.room.localParticipant.identity);
      if (participantData) {
        participantData.isCameraOn = this.room.localParticipant.isCameraEnabled;
        this.notifyParticipantsChange();
      }
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

  async reconnect(config: LiveKitConfig): Promise<void> {
    if (!this.room) {
      throw new Error('No room to reconnect');
    }
    
    try {
      console.log('Attempting to reconnect to room...');
      
      // Try to reconnect using the existing room instance
      await this.room.connect(config.serverUrl, config.token);
      
      // Wait for connection to be established
      await this.waitForConnection();
      
      console.log('Reconnection successful');
      
    } catch (error) {
      console.error('Reconnection failed:', error);
      throw error;
    }
  }

  getParticipants(): ParticipantData[] {
    return Array.from(this.participants.values());
  }

  // Method to preserve participants during reconnection
  preserveParticipants(): ParticipantData[] {
    const participants = Array.from(this.participants.values());
    console.log('Preserving participants:', participants.length);
    return participants;
  }

  // Method to restore participants after reconnection
  restoreParticipants(participants: ParticipantData[]): void {
    console.log('Restoring participants:', participants.length);
    this.participants.clear();
    participants.forEach(participant => {
      this.participants.set(participant.participant.identity, participant);
    });
    this.notifyParticipantsChange();
  }

  isConnected(): boolean {
    return this.room?.state === 'connected';
  }

  getConnectionState(): string {
    return this.room?.state || 'disconnected';
  }

  // Get detailed connection information
  getConnectionInfo(): { state: string; isConnected: boolean; hasRoom: boolean } {
    return {
      state: this.room?.state || 'disconnected',
      isConnected: this.room?.state === 'connected',
      hasRoom: !!this.room
    };
  }

  getLocalParticipant(): LocalParticipant | null {
    return this.room?.localParticipant || null;
  }

  // Public method to refresh video tracks
  public refreshVideoTracks(): void {
    this.refreshVideoTracksInternal();
  }

  // Public method to refresh all participant tracks
  public refreshAllParticipantTracks(): void {
    if (!this.room) return;
    
    console.log('Refreshing all participant tracks...');
    
    // Refresh local participant tracks
    this.refreshVideoTracksInternal();
    
    // Refresh remote participant tracks
    for (const [identity, participantData] of Array.from(this.participants.entries())) {
      if (!participantData.isLocal) {
        console.log('Refreshing tracks for remote participant:', identity);
        this.updateParticipantFromLiveKit(identity);
      }
    }
  }

  // Update participant data from LiveKit participant
  private updateParticipantFromLiveKit(identity: string): void {
    if (!this.room) return;
    
    const liveKitParticipant = this.room.getParticipantByIdentity(identity);
    if (!liveKitParticipant) return;
    
    const participantData = this.participants.get(identity);
    if (!participantData) return;
    
    // Update track information
    const videoPublications = Array.from(liveKitParticipant.videoTrackPublications.values());
    const audioPublications = Array.from(liveKitParticipant.audioTrackPublications.values());
    
    const videoTrack = videoPublications.find(pub => pub.track)?.track;
    const audioTrack = audioPublications.find(pub => pub.track)?.track;
    
    console.log('Updating participant tracks:', {
      identity,
      hasVideoTrack: !!videoTrack,
      hasAudioTrack: !!audioTrack,
      isCameraOn: liveKitParticipant.isCameraEnabled,
      isMuted: !liveKitParticipant.isMicrophoneEnabled
    });
    
    // Update participant data
    participantData.videoTrack = videoTrack as LocalTrack | RemoteTrack | undefined;
    participantData.audioTrack = audioTrack as LocalTrack | RemoteTrack | undefined;
    participantData.isCameraOn = liveKitParticipant.isCameraEnabled;
    participantData.isMuted = !liveKitParticipant.isMicrophoneEnabled;
    
    this.notifyParticipantsChange();
  }

  // Public method to force camera restoration
  public forceCameraRestoration(): void {
    if (!this.room || this.room.state !== 'connected') {
      console.log('Room not connected, skipping camera restoration');
      return;
    }
    
    console.log('Force camera restoration requested...', { lastCameraState: this.lastCameraState });
    
    if (this.lastCameraState) {
      // Wait for engine to be ready before attempting restoration
      this.waitForEngineBeforePublish().then(() => {
        console.log('Engine ready, attempting camera restoration...');
        // Reset restoration attempts and start fresh
        this.restorationAttempts = 0;
        this.restoreCameraState();
      }).catch((error) => {
        console.warn('Engine not ready for camera restoration, skipping:', error);
      });
    }
  }

  // Public method to get current camera state
  public getCameraState(): boolean {
    return this.lastCameraState;
  }

  // Public method to set camera state (for external control)
  public setCameraState(state: boolean): void {
    // Only update camera state if we're not in the middle of a reconnection
    if (this.room?.state === 'connected' || !this.room) {
      this.lastCameraState = state;
      console.log('Camera state set to:', state);
    } else {
      console.log('Preserving camera state during reconnection:', this.lastCameraState);
    }
  }

  // Check if engine is ready for publishing
  private isEngineReady(): boolean {
    if (!this.room) return false;
    
    try {
      // Check if room is connected first
      if (this.room.state !== 'connected') {
        return false;
      }
      
      // Check if engine exists and is in a good state
      const engine = (this.room as any).engine;
      if (!engine) {
        return false;
      }
      
      // More lenient check - engine can be in 'connected' or 'connecting' state
      // Also allow if engine exists and room is connected
      return (engine.state === 'connected' || engine.state === 'connecting') && this.room.state === 'connected';
    } catch (e) {
      return false;
    }
  }

  // Wait for engine to be ready before publishing
  private async waitForEngineBeforePublish(): Promise<void> {
    if (!this.room) return;
    
    // First check if room is connected
    if (this.room.state !== 'connected') {
      throw new Error(`Room not connected (state: ${this.room.state})`);
    }
    
    let attempts = 0;
    const maxAttempts = 5; // Reduced to 500ms max wait
    
    while (!this.isEngineReady() && attempts < maxAttempts) {
      console.log(`Waiting for engine to be ready, attempt ${attempts + 1}`);
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    // Always proceed - the SDK will handle engine readiness internally
    console.log('Proceeding with operation - engine will be handled by SDK');
  }

  private refreshVideoTracksInternal(): void {
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
      
      // Only update video track if we have a track or camera is actually off
      if (videoTrack) {
        participantData.videoTrack = videoTrack;
        console.log('Video track attached to participant data');
      } else if (!localParticipant.isCameraEnabled) {
        // Only clear video track if camera is actually disabled in LiveKit
        participantData.videoTrack = undefined;
        console.log('No video track found - camera is off');
      } else {
        // Don't clear video track if camera is enabled but no track yet - might be publishing
        console.log('No video track found but camera is on - waiting for track to be published');
      }
      
      // Only update audio track if we have a track
      if (audioTrack) {
        participantData.audioTrack = audioTrack;
        console.log('Audio track attached to participant data');
      } else {
        // Don't clear audio track unnecessarily - it might be muted but still exist
        console.log('No audio track found');
      }
      
      this.notifyParticipantsChange();
    }
  }

  // Method to restore camera state after reconnection
  private restoreCameraState(): void {
    if (!this.room) return;
    
    const localParticipant = this.room?.localParticipant;
    const participantData = localParticipant ? this.participants.get(localParticipant.identity) : null;
    
    // Check if camera should be on based on our tracked state
    const shouldCameraBeOn = this.lastCameraState;
    
    if (shouldCameraBeOn) {
      console.log('Restoring camera state after reconnection...', { 
        shouldCameraBeOn, 
        hasVideoTrack: !!participantData?.videoTrack,
        isCameraEnabled: localParticipant?.isCameraEnabled,
        attempt: this.restorationAttempts + 1,
        roomState: this.room.state
      });
      
      this.restorationAttempts++;
      
      // Update participant data to reflect camera should be on
      if (participantData) {
        participantData.isCameraOn = true;
        this.notifyParticipantsChange();
      }
      
      // Wait for engine to be ready before attempting camera restoration
      this.waitForEngineBeforePublish().then(() => {
        // Only restore if engine is ready and room is connected
        if (this.room?.state === 'connected' && !localParticipant?.isCameraEnabled) {
          console.log('Re-enabling camera after reconnection (engine ready)...');
          this.room?.localParticipant?.setCameraEnabled(true);
          
          // Refresh tracks after a delay
          setTimeout(() => {
            this.refreshVideoTracksInternal();
          }, 2000);
        }
      }).catch((error) => {
        console.warn('Engine not ready for camera restoration:', error);
        // Don't attempt restoration if engine is not ready
      });
    }
  }

  // Simplified camera restoration
  private attemptCameraRestoration(): void {
    if (this.restorationAttempts > this.maxRestorationAttempts) {
      console.log('Max restoration attempts reached, giving up');
      return;
    }

    const localParticipant = this.room?.localParticipant;
    const participantData = localParticipant ? this.participants.get(localParticipant.identity) : null;
    
    if (!participantData || !this.lastCameraState) return;

    console.log(`Camera restoration attempt ${this.restorationAttempts}/${this.maxRestorationAttempts}`);

    // Simple strategy: just enable camera and refresh tracks
    if (!localParticipant?.isCameraEnabled) {
      console.log('Enabling camera for restoration...');
      this.room?.localParticipant?.setCameraEnabled(true);
    }
    
    // Refresh tracks after a delay
    setTimeout(() => {
      this.refreshVideoTracksInternal();
      this.checkAndRetryRestoration();
    }, 2000);
  }

  // Check if restoration was successful and retry if needed
  private checkAndRetryRestoration(): void {
    const localParticipant = this.room?.localParticipant;
    const participantData = localParticipant ? this.participants.get(localParticipant.identity) : null;
    
    if (participantData && this.lastCameraState && !participantData.videoTrack) {
      console.log('Restoration failed, retrying...', { 
        hasVideoTrack: !!participantData.videoTrack,
        isCameraEnabled: localParticipant?.isCameraEnabled,
        attempt: this.restorationAttempts
      });
      
      // Only retry if we haven't exceeded max attempts
      if (this.restorationAttempts < this.maxRestorationAttempts) {
        setTimeout(() => {
          this.restoreCameraState();
        }, 3000); // Increased delay between retries
      } else {
        console.log('Max restoration attempts reached, giving up');
      }
    } else if (participantData && participantData.videoTrack) {
      console.log('Camera restoration successful!');
      this.restorationAttempts = 0; // Reset counter on success
    }
  }

  // Method to handle connection stability
  private handleConnectionStability(): void {
    if (!this.room) return;
    
    let connectionStableCount = 0;
    const requiredStableChecks = 5; // Increased to 5 consecutive stable checks
    
    // Monitor connection state and refresh tracks if needed
    const checkConnection = () => {
      if (this.room?.state === 'connected') {
        connectionStableCount++;
        
        // Only proceed with restoration after connection has been stable for a while
        if (connectionStableCount >= requiredStableChecks) {
          const localParticipant = this.room?.localParticipant;
          const participantData = localParticipant ? this.participants.get(localParticipant.identity) : null;
          
          // Only restore if camera should be on AND we have no video track AND camera is actually enabled in LiveKit
          const shouldCameraBeOn = this.lastCameraState;
          const isCameraEnabledInLiveKit = localParticipant?.isCameraEnabled;
          const hasVideoTrack = !!participantData?.videoTrack;
          
          // More conservative restoration - only if we're missing video track but camera should be on
          if (shouldCameraBeOn && isCameraEnabledInLiveKit && !hasVideoTrack) {
            console.log('Camera should be on and is enabled in LiveKit but no video track - triggering restoration...', { 
              shouldCameraBeOn, 
              isCameraEnabled: isCameraEnabledInLiveKit,
              hasVideoTrack,
              restorationAttempts: this.restorationAttempts,
              stableChecks: connectionStableCount
            });
            
            // Only attempt restoration if we haven't tried too many times recently
            if (this.restorationAttempts < 2) {
              this.restoreCameraState();
            }
          }
          
          // Only refresh tracks if connection quality is poor AND we're missing tracks
          if (localParticipant?.connectionQuality === ConnectionQuality.Poor && !hasVideoTrack && shouldCameraBeOn) {
            console.log('Poor connection quality and missing video track - attempting refresh');
            this.refreshVideoTracksInternal();
          }
        }
      } else {
        // Reset stable count if connection is not stable
        connectionStableCount = 0;
      }
    };
    
    // Check every 10 seconds for monitoring (reduced frequency to prevent interference)
    setInterval(checkConnection, 10000);
  }
}

// Helper function to generate a demo token (for development only)
export const generateDemoToken = (roomName: string, participantName: string): string => {
  // In production, you should generate tokens on your server
  // This is just for demo purposes
  return `demo-token-${roomName}-${participantName}`;
};
