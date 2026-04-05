// Bylaw Chat - stores conversation in sessionStorage

let currentBylawId = null;

const messages = JSON.parse(sessionStorage.getItem('bylaw_chat') || '[]');

async function loadDefaultBylaw() {
  try {
    const res = await fetch('/api/bylaws/', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('panchayat_token')}`
      }
    });
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      currentBylawId = data.results[0].id;
    } else {
      currentBylawId = 1;
    }
  } catch (e) {
    console.error('[BYLAW] Error loading bylaws:', e);
    currentBylawId = 1;
  }
}

function appendMessage(role, text, citation = '') {
  const chatContainer = document.getElementById('bylaw-chat');
  if (!chatContainer) {
    console.error('[BYLAW] Chat container not found');
    return;
  }
  
  const msgDiv = document.createElement('div');
  msgDiv.className = role === 'user' ? 'chat-message user' : 'chat-message ai';
  
  let html = `<p class="mb-1">${text}</p>`;
  if (citation) {
    html += `<small class="text-muted">${citation}</small>`;
  }
  
  msgDiv.innerHTML = html;
  chatContainer.appendChild(msgDiv);
  
  // Save to sessionStorage
  messages.push({ role, text, citation, timestamp: new Date().toISOString() });
  sessionStorage.setItem('bylaw_chat', JSON.stringify(messages));
  
  // Scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function sendQuestion(question, bylawId = null) {
  console.log('[BYLAW] Sending question:', question, 'bylawId:', bylawId);
  
  const finalBylawId = bylawId || currentBylawId || 1;
  appendMessage('user', question);
  
  const chatContainer = document.getElementById('bylaw-chat');
  if (!chatContainer) {
    console.error('[BYLAW] Chat container not found');
    return;
  }
  
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'chat-message ai';
  loadingDiv.innerHTML = '<p class="mb-0"><i class="fas fa-spinner fa-spin"></i> Thinking...</p>';
  chatContainer.appendChild(loadingDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  
  fetch('/api/bylaws/ask/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('panchayat_token')}`
    },
    body: JSON.stringify({ question, bylaw_id: finalBylawId })
  })
  .then(res => res.json())
  .then(data => {
    console.log('[BYLAW] Response:', data);
    loadingDiv.remove();
    if (data.success) {
      appendMessage('ai', data.data.answer, 'Source: Bylaws');
    } else {
      appendMessage('ai', data.message || 'Sorry, I could not answer that.', '');
      showToast(data.message || 'Error getting answer', 'error');
    }
  })
  .catch(err => {
    console.error('[BYLAW] Error:', err);
    loadingDiv.remove();
    appendMessage('ai', 'Sorry, something went wrong.', '');
    showToast('Failed to get response', 'error');
  });
}

function renderChat() {
  const chatContainer = document.getElementById('bylaw-chat');
  if (!chatContainer) return;
  
  chatContainer.innerHTML = '';
  
  if (messages.length === 0) {
    chatContainer.innerHTML = `
      <div class="text-center text-muted py-5">
        <i class="fas fa-robot fa-3x mb-3" style="color: var(--brand-light);"></i>
        <p>Ask me anything about society bylaws</p>
      </div>
    `;
    return;
  }
  
  messages.forEach(msg => {
    const msgDiv = document.createElement('div');
    msgDiv.className = msg.role === 'user' ? 'chat-message user' : 'chat-message ai';
    let html = `<p class="mb-1">${msg.text}</p>`;
    if (msg.citation) {
      html += `<small class="text-muted">${msg.citation}</small>`;
    }
    msgDiv.innerHTML = html;
    chatContainer.appendChild(msgDiv);
  });
  
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function clearChat() {
  messages.length = 0;
  sessionStorage.removeItem('bylaw_chat');
  renderChat();
}

function askBylaw(question, bylawId = 1) {
  sendQuestion(question, bylawId);
}

async function initBylawChat() {
  console.log('[BYLAW] Initializing...');
  
  // Clear old chat on page load
  sessionStorage.removeItem('bylaw_chat');
  messages.length = 0;
  
  await loadDefaultBylaw();
  console.log('[BYLAW] Default bylaw ID:', currentBylawId);
  
  renderChat();
  
  const input = document.getElementById('bylaw-input');
  const sendBtn = document.getElementById('bylaw-send');
  
  if (sendBtn && input) {
    sendBtn.addEventListener('click', () => {
      const question = input.value.trim();
      if (question) {
        sendQuestion(question);
        input.value = '';
      }
    });
    
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendBtn.click();
      }
    });
    
    console.log('[BYLAW] Event listeners attached');
  } else {
    console.warn('[BYLAW] Input or send button not found');
  }
  
  // Quick question buttons
  document.querySelectorAll('.quick-question').forEach(btn => {
    btn.addEventListener('click', () => {
      sendQuestion(btn.textContent);
    });
  });
  
  console.log('[BYLAW] Initialization complete');
}

// Export functions to window
window.askBylaw = askBylaw;
window.clearChat = clearChat;
window.initBylawChat = initBylawChat;