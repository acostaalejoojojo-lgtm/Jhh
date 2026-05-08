import { Peer, MediaConnection, DataConnection } from 'peerjs';
import { RemotePlayer, Message } from '../types';

export interface P2PUpdate {
  type: 'movement' | 'chat' | 'voice_status';
  payload: any;
}

class P2PService {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private voiceCalls: Map<string, MediaConnection> = new Map();
  private localStream: MediaStream | null = null;
  private onMessage: (msg: any) => void = () => {};
  private onPlayerUpdate: (player: Partial<RemotePlayer>) => void = () => {};
  private isMicEnabled: boolean = false;

  async init(uid: string) {
    if (this.peer) return;

    // Use a unique ID for P2P based on UID
    this.peer = new Peer(`glidrovia-${uid}`, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ]
      }
    });

    this.peer.on('open', (id) => {
      console.log('P2P: Peer ID is', id);
    });

    this.peer.on('connection', (conn) => {
      this.setupConnection(conn);
    });

    this.peer.on('call', async (call) => {
      if (this.isMicEnabled && this.localStream) {
        call.answer(this.localStream);
      } else {
        // Even if mic is off, we answer with null or empty stream to stay in the call logic?
        // Actually, PeerJS needs a stream if we want to hear.
        call.answer();
      }
      this.setupVoiceCall(call);
    });
  }

  toggleMic(enabled: boolean): Promise<boolean> {
    return new Promise(async (resolve) => {
      this.isMicEnabled = enabled;
      if (enabled) {
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Call all existing peers to share audio
          this.connections.forEach((conn, peerId) => {
            if (!this.voiceCalls.has(peerId)) {
                this.callPeer(peerId);
            }
          });
          resolve(true);
        } catch (err) {
          console.error("Failed to get microphone:", err);
          this.isMicEnabled = false;
          resolve(false);
        }
      } else {
        if (this.localStream) {
          this.localStream.getTracks().forEach(track => track.stop());
          this.localStream = null;
        }
        this.voiceCalls.forEach(call => call.close());
        this.voiceCalls.clear();
        resolve(true);
      }
    });
  }

  private setupConnection(conn: DataConnection) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
    });

    conn.on('data', (data: any) => {
      const update = data as P2PUpdate;
      if (update.type === 'movement') {
        this.onPlayerUpdate(update.payload);
      } else if (update.type === 'chat') {
        this.onMessage(update.payload);
      }
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
    });
  }

  private setupVoiceCall(call: MediaConnection) {
    call.on('stream', (remoteStream) => {
      // Logic to play remote stream
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.play().catch(e => console.error("Auto-play blocked:", e));
    });

    call.on('close', () => {
      this.voiceCalls.delete(call.peer);
    });

    this.voiceCalls.set(call.peer, call);
  }

  connectToPeer(peerId: string) {
    if (!this.peer || this.connections.has(peerId)) return;
    const conn = this.peer.connect(peerId);
    this.setupConnection(conn);
    
    if (this.isMicEnabled && this.localStream) {
        this.callPeer(peerId);
    }
  }

  private callPeer(peerId: string) {
      if (!this.peer || !this.localStream) return;
      const call = this.peer.call(peerId, this.localStream);
      this.setupVoiceCall(call);
  }

  broadcast(update: P2PUpdate) {
    this.connections.forEach(conn => {
      if (conn.open) {
        conn.send(update);
      }
    });
  }

  setHandlers(onMessage: (msg: any) => void, onPlayerUpdate: (p: any) => void) {
    this.onMessage = onMessage;
    this.onPlayerUpdate = onPlayerUpdate;
  }
}

export const p2pService = new P2PService();
