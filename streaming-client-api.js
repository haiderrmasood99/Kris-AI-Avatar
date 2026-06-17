'use strict';

class VideoAgent {
  constructor() {
    this.peerConnection = null;
    this.streamId = null;
    this.sessionId = null;
    this.statsIntervalId = null;
    this.config = null;
    this.lastBytesReceived = 0;
    this.videoIsPlaying = false;

    this.idleVideo = document.getElementById('idle-video');
    this.talkVideo = document.getElementById('talk-video');
    this.errorMessage = document.getElementById('error-message');

    this.init();
  }

  async init() {
    try {
      this.config = await this.fetchJson('/api/client-config');
      if (!this.config.configured) {
        throw new Error(`Missing local configuration: ${this.config.missing.join(', ')}`);
      }

      this.talkVideo.setAttribute('playsinline', '');
      this.setupEventListeners();
      this.clearError();
    } catch (error) {
      this.showError(error.message);
    }
  }

  setupEventListeners() {
    document.getElementById('connect-button').addEventListener('click', () => this.handleConnect());
    document.getElementById('destroy-button').addEventListener('click', () => this.handleDestroy());
    document.getElementById('enter-button').addEventListener('click', () => this.handleTalk());
    document.getElementById('user-input-field').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.handleTalk();
    });

    document.getElementById('theme-toggle').addEventListener('click', () => {
      document.body.classList.toggle('light-mode');
    });
  }

  async fetchJson(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Request failed with ${response.status}`);
    }

    return payload;
  }

  async handleConnect() {
    const connectButton = document.getElementById('connect-button');
    connectButton.classList.add('loading');
    this.clearError();

    try {
      if (this.peerConnection?.connectionState === 'connected') return;

      this.cleanup();

      const { id, offer, ice_servers: iceServers, session_id: sessionId } = await this.createStream();
      this.streamId = id;
      this.sessionId = sessionId;

      const answer = await this.createPeerConnection(offer, iceServers);
      await this.sendSDPAnswer(answer);

      connectButton.classList.add('connected');
      this.updateUI(true);
      document.getElementById('user-input-field').focus();
    } catch (error) {
      this.showError(`Connection failed: ${error.message}`);
      connectButton.classList.remove('connected');
      this.cleanup();
    } finally {
      connectButton.classList.remove('loading');
    }
  }

  async handleTalk() {
    const inputContainer = document.getElementById('input-container');
    const inputField = document.getElementById('user-input-field');

    try {
      if (!this.streamId || !this.sessionId) {
        throw new Error('Connect to the avatar before sending a message.');
      }

      const userMessage = inputField.value.trim();
      if (!userMessage) throw new Error('Please enter a message.');

      this.clearError();
      inputContainer.classList.add('loading');

      const { fetchOpenAIResponse } = await import('./openai.js');
      const aiResponse = await fetchOpenAIResponse(userMessage);
      await this.sendTalkRequest(aiResponse);

      inputField.value = '';
    } catch (error) {
      this.showError(error.message);
    } finally {
      inputContainer.classList.remove('loading');
    }
  }

  async handleDestroy() {
    const connectButton = document.getElementById('connect-button');

    try {
      if (this.streamId) await this.deleteStream();
    } catch (error) {
      this.showError(`Disconnect failed: ${error.message}`);
    } finally {
      this.cleanup();
      this.updateUI(false);
      connectButton.classList.remove('connected', 'loading');
    }
  }

  createStream() {
    return this.fetchJson('/api/did/streams', { method: 'POST' });
  }

  async createPeerConnection(offer, iceServers) {
    const PeerConnection =
      window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;

    if (!PeerConnection) {
      throw new Error('This browser does not support WebRTC peer connections.');
    }

    this.peerConnection = new PeerConnection({ iceServers });

    this.peerConnection.onicecandidate = (event) => {
      if (!event.candidate) return;

      this.fetchJson(`/api/did/streams/${encodeURIComponent(this.streamId)}/ice`, {
        method: 'POST',
        body: JSON.stringify({
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          session_id: this.sessionId,
        }),
      }).catch((error) => this.showError(`ICE candidate failed: ${error.message}`));
    };

    this.peerConnection.ontrack = (event) => {
      if (event.track.kind !== 'video') return;

      this.statsIntervalId = setInterval(async () => {
        if (!this.peerConnection) return;

        const stats = await this.peerConnection.getStats(event.track);
        stats.forEach((report) => {
          if (report.type !== 'inbound-rtp' || report.kind !== 'video') return;

          const isPlaying = report.bytesReceived > this.lastBytesReceived;
          if (isPlaying !== this.videoIsPlaying) {
            this.videoIsPlaying = isPlaying;
            this.updateStatus('streaming', isPlaying ? 'streaming' : 'idle');

            if (isPlaying) {
              this.idleVideo.style.display = 'none';
              this.talkVideo.style.display = 'block';
              this.talkVideo.srcObject = event.streams[0];
              this.talkVideo.play().catch((error) => this.showError(error.message));
            } else {
              this.talkVideo.pause();
              this.talkVideo.srcObject = null;
              this.talkVideo.style.display = 'none';
              this.idleVideo.style.display = 'block';
            }
          }

          this.lastBytesReceived = report.bytesReceived;
        });
      }, 500);
    };

    await this.peerConnection.setRemoteDescription(offer);
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  sendSDPAnswer(answer) {
    return this.fetchJson(`/api/did/streams/${encodeURIComponent(this.streamId)}/sdp`, {
      method: 'POST',
      body: JSON.stringify({
        answer,
        session_id: this.sessionId,
      }),
    });
  }

  sendTalkRequest(aiResponse) {
    return this.fetchJson(`/api/did/streams/${encodeURIComponent(this.streamId)}/talk`, {
      method: 'POST',
      body: JSON.stringify({
        input: aiResponse,
        session_id: this.sessionId,
      }),
    });
  }

  deleteStream() {
    return this.fetchJson(`/api/did/streams/${encodeURIComponent(this.streamId)}`, {
      method: 'DELETE',
      body: JSON.stringify({ session_id: this.sessionId }),
    });
  }

  cleanup() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.statsIntervalId) {
      clearInterval(this.statsIntervalId);
      this.statsIntervalId = null;
    }

    if (this.talkVideo) {
      this.talkVideo.pause();
      if (this.talkVideo.srcObject) {
        this.talkVideo.srcObject.getTracks().forEach((track) => track.stop());
      }
      this.talkVideo.srcObject = null;
      this.talkVideo.style.display = 'none';
    }

    if (this.idleVideo) this.idleVideo.style.display = 'block';

    this.streamId = null;
    this.sessionId = null;
    this.lastBytesReceived = 0;
    this.videoIsPlaying = false;

    ['peer', 'ice', 'signaling', 'streaming'].forEach((type) => {
      this.updateStatus(type, type === 'signaling' ? 'stable' : 'disconnected');
    });
  }

  updateUI(connected) {
    const connectButton = document.getElementById('connect-button');
    const destroyButton = document.getElementById('destroy-button');

    destroyButton.disabled = !connected;
    connectButton.innerText = connected ? 'Connected' : 'Connect';
    connectButton.classList.toggle('connected', connected);
  }

  updateStatus(type, state) {
    const label = document.getElementById(`${type}-status-label`);
    if (!label) return;

    label.innerText = state;
    label.className = `status-value ${type}-${state}`;
  }

  clearError() {
    if (!this.errorMessage) return;
    this.errorMessage.innerText = '';
    this.errorMessage.hidden = true;
  }

  showError(message) {
    console.error(message);
    if (!this.errorMessage) {
      alert(message);
      return;
    }

    this.errorMessage.innerText = message;
    this.errorMessage.hidden = false;
  }
}

document.addEventListener('DOMContentLoaded', () => new VideoAgent());
