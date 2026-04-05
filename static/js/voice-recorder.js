// Voice Recorder with Debug Support
class VoiceRecorder {
  constructor(onTranscript, onStatusChange) {
    this.onTranscript = onTranscript;
    this.onStatusChange = onStatusChange;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.startTime = null;
    this.timerInterval = null;
  }

  async start() {
    console.log('[VOICE] Starting recording...');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };

      this.mediaRecorder.onstop = () => {
        console.log('[VOICE] Recording stopped, uploading...');
        this.uploadAudio();
      };

      this.mediaRecorder.start();
      this.startTime = Date.now();
      
      this.updateTimer();
      this.timerInterval = setInterval(() => this.updateTimer(), 1000);
      
      if (this.onStatusChange) {
        this.onStatusChange('recording');
      }
      console.log('[VOICE] Recording started');
    } catch (error) {
      console.error('[VOICE] Error starting recording:', error);
      showToast('Could not access microphone. Please ensure microphone permissions are granted.', 'error');
    }
  }

  stop() {
    console.log('[VOICE] Stopping recording...');
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      clearInterval(this.timerInterval);
      
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }
      
      if (this.onStatusChange) {
        this.onStatusChange('stopped');
      }
    }
  }

  updateTimer() {
    if (!this.startTime) return;
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    
    const timerEl = document.getElementById('recording-timer');
    if (timerEl) {
      timerEl.textContent = `${minutes}:${seconds}`;
    }
  }

  async uploadAudio() {
    console.log('[VOICE] Uploading audio...');
    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
    console.log('[VOICE] Audio blob size:', audioBlob.size);
    
    const formData = new FormData();
    formData.append('audio_file', audioBlob, 'recording.webm');

    showToast('Processing audio...', 'info');

    try {
      const response = await fetch('/api/complaints/voice/transcribe/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('panchayat_token')}`
        },
        body: formData
      });

      const result = await response.json();
      console.log('[VOICE] Upload response:', result);

      if (result.success && this.onTranscript) {
        this.onTranscript(result.data);
        showToast('Transcription complete', 'success');
      } else {
        showToast(result.message || 'Transcription failed', 'error');
      }
    } catch (error) {
      console.error('[VOICE] Upload error:', error);
      showToast('Failed to process audio', 'error');
    }
  }
}

// Initialize voice recorder when page loads
let voiceRecorder = null;

function initVoiceRecorder(onTranscript) {
  console.log('[VOICE] Initializing voice recorder...');
  
  const btn = document.getElementById('voice-btn');
  if (!btn) {
    console.warn('[VOICE] Voice button not found');
    return;
  }
  
  console.log('[VOICE] Creating voice recorder instance');
  voiceRecorder = new VoiceRecorder(
    onTranscript,
    (status) => {
      console.log('[VOICE] Status changed:', status);
      if (!btn) return;
      if (status === 'recording') {
        btn.classList.add('recording');
        btn.innerHTML = `
          <i class="fas fa-stop fa-2x text-danger"></i>
          <div id="recording-timer" class="mt-2">00:00</div>
          <div class="waveform mt-2">
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
          </div>
        `;
      } else {
        btn.classList.remove('recording');
        btn.innerHTML = `
          <i class="fas fa-microphone fa-2x"></i>
          <p class="mb-0 mt-2">Click to record</p>
        `;
      }
    }
  );

  btn.addEventListener('click', () => {
    console.log('[VOICE] Button clicked');
    if (voiceRecorder && voiceRecorder.mediaRecorder && voiceRecorder.mediaRecorder.state === 'recording') {
      voiceRecorder.stop();
    } else if (voiceRecorder) {
      voiceRecorder.start();
    }
  });
  
  console.log('[VOICE] Voice recorder initialized');
}

// Export for use
window.initVoiceRecorder = initVoiceRecorder;