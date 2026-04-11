/**
 * Panchayat Chat System - WebSocket + Polling Hybrid
 * 
 * Features:
 * - Real-time WebSocket messaging with auto-reconnect
 * - Automatic polling fallback if WebSocket fails
 * - Typing indicators with other user names
 * - Online/offline status tracking
 * - Read receipts (double tick)
 * - Delete message (for me / for everyone)
 * - Clear chat functionality
 * - Proper room selection and UI updates
 * - Message visibility filtering
 */

// Global state
let currentRoomId = null;
let currentRoomName = null;
let chatSocket = null;
let wsConnected = false;
let wsReconnectAttempts = 0;
let chatPollInterval = null;
let isPollingActive = false;

const MAX_WS_RECONNECT_ATTEMPTS = 5;
const POLLING_INTERVAL_MS = 30000;
const TYPING_TIMEOUT_MS = 2000;

// Track message count to avoid duplicate polling updates
let lastMessageCount = 0;
let lastRoomCount = 0;

let typingTimeoutId = null;
let typingUsersMap = new Map(); // Track typing users with timeout IDs

console.log('[CHAT] Chat module loaded');

// ==================== INITIALIZATION ====================

/**
 * Initialize chat system: load rooms and setup WebSocket
 */
window.initChat = async function() {
    console.log('[CHAT] initChat called');
    try {
        // Load chat rooms first
        await loadChatRooms();
        console.log('[CHAT] Chat initialized successfully');
    } catch (error) {
        console.error('[CHAT] Error initializing chat:', error);
    }
};

// ==================== WEBSOCKET CONNECTION ====================

/**
 * Initialize WebSocket connection for current room
 */
async function initWebSocket() {
    if (!currentRoomId) {
        console.log('[CHAT] No room selected, skipping WebSocket');
        return;
    }
    
    // Close existing socket
    if (chatSocket) {
        chatSocket.close();
        chatSocket = null;
    }
    
    const token = localStorage.getItem('panchayat_token');
    if (!token) {
        console.warn('[CHAT] No auth token found');
        startPolling();
        return;
    }
    
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}://${window.location.host}/ws/chat/${currentRoomId}/`;
    
    console.log('[CHAT] Connecting to WebSocket:', wsUrl);
    
    try {
        chatSocket = new WebSocket(wsUrl);
        
        chatSocket.onopen = function(e) {
            console.log('[CHAT] WebSocket connected successfully');
            wsConnected = true;
            wsReconnectAttempts = 0;
            stopPolling();
        };
        
        chatSocket.onmessage = function(e) {
            try {
                const data = JSON.parse(e.data);
                handleWebSocketMessage(data);
            } catch (error) {
                console.error('[CHAT] Error parsing WebSocket message:', error);
            }
        };
        
        chatSocket.onclose = function(e) {
            console.log('[CHAT] WebSocket closed - code:', e.code, 'reason:', e.reason);
            wsConnected = false;
            
            // Auto-reconnect for abnormal close
            if (e.code !== 1000 && wsReconnectAttempts < MAX_WS_RECONNECT_ATTEMPTS) {
                wsReconnectAttempts++;
                const delayMs = 2000 * wsReconnectAttempts;
                console.log(`[CHAT] Reconnecting in ${delayMs}ms (attempt ${wsReconnectAttempts})`);
                setTimeout(initWebSocket, delayMs);
            } else if (e.code !== 1000) {
                console.log('[CHAT] Max reconnect attempts reached, using polling');
                startPolling();
            }
        };
        
        chatSocket.onerror = function(e) {
            console.error('[CHAT] WebSocket error:', e);
            wsConnected = false;
        };
    } catch (error) {
        console.error('[CHAT] Error creating WebSocket:', error);
        wsConnected = false;
        startPolling();
    }
}

/**
 * Send message via WebSocket
 */
function sendViaWebSocket(type, data) {
    if (chatSocket && wsConnected) {
        try {
            chatSocket.send(JSON.stringify({
                type: type,
                ...data
            }));
            return true;
        } catch (error) {
            console.error('[CHAT] Error sending via WebSocket:', error);
            return false;
        }
    }
    return false;
}

// ==================== WEBSOCKET MESSAGE HANDLERS ====================

/**
 * Route incoming WebSocket messages to appropriate handlers
 */
function handleWebSocketMessage(data) {
    console.debug('[CHAT] Received WebSocket message:', data.type);
    
    switch (data.type) {
        case 'initial_messages':
            handleInitialMessages(data.messages);
            break;
        case 'chat_message':
            handleReceivedMessage(data.message);
            break;
        case 'typing':
            handleTypingIndicator(data);
            break;
        case 'read_receipt':
            handleReadReceipt(data);
            break;
        case 'message_deleted':
            handleMessageDeleted(data);
            break;
        case 'chat_cleared':
            handleChatCleared(data);
            break;
        case 'user_online_status':
            handleUserOnlineStatus(data);
            break;
        default:
            console.warn('[CHAT] Unknown message type:', data.type);
    }
}

/**
 * Handle initial cached messages on connect
 */
function handleInitialMessages(messages) {
    console.log('[CHAT] Received initial messages:', messages?.length || 0);
    const container = document.getElementById('chat-messages-list');
    const emptyMsg = document.getElementById('chat-empty');
    
    if (!container) return;
    
    if (messages && messages.length > 0) {
        if (emptyMsg) emptyMsg.classList.add('d-none');
        container.innerHTML = messages.map(msg => buildMessageHTML(msg)).join('');
        lastMessageCount = messages.length;
        scrollToBottom();
    } else {
        if (emptyMsg) emptyMsg.classList.remove('d-none');
        container.innerHTML = '';
        lastMessageCount = 0;
    }
}

/**
 * Handle incoming message
 */
function handleReceivedMessage(msg) {
    console.log('[CHAT] Received message:', msg.id);
    const container = document.getElementById('chat-messages-list');
    const emptyMsg = document.getElementById('chat-empty');
    
    if (!container) return;
    
    // Remove any temporary messages matching this real message
    const currentUserId = getCurrentUserId();
    const msgSenderId = msg.sender_id;
    if (currentUserId && currentUserId === msgSenderId) {
        const tempMessages = container.querySelectorAll('[id^="msg-temp-"]');
        const now = Date.now();
        const msgContent = msg.content || '';
        tempMessages.forEach(tempEl => {
            const contentEl = tempEl.querySelector('.message-content');
            if (contentEl && contentEl.textContent === msgContent) {
                const tempId = tempEl.id.replace('msg-temp-', '');
                if (now - parseInt(tempId) < 5000) {
                    tempEl.remove();
                    lastMessageCount = Math.max(0, (lastMessageCount || 1) - 1);
                }
            }
        });
    }
    
    if (emptyMsg) emptyMsg.classList.add('d-none');
    
    // Build message HTML with defaults
    const isMe = msg.is_me === true || msg.sender_id === currentUserId;
    const msgData = {
        id: msg.id,
        content: msg.content || '',
        sender_id: msg.sender_id,
        sender_name: msg.sender_name || 'Unknown',
        sender_role: msg.sender_role || '',
        created_at: msg.created_at,
        is_read: msg.is_read || false,
        is_me: isMe,
        is_deleted_for_everyone: msg.is_deleted_for_everyone === true,
        can_delete: msg.can_delete !== false
    };
    
    container.insertAdjacentHTML('beforeend', buildMessageHTML(msgData));
    lastMessageCount = (lastMessageCount || 0) + 1;
    scrollToBottom();
    
    // Update room list
    loadChatRooms();
    
    // Send read receipt if not own message
    if (!isMe) {
        if (sendViaWebSocket('mark_read', { message_ids: [msg.id] })) {
            console.log('[CHAT] Sent read receipt via WebSocket');
        } else {
            console.log('[CHAT] Failed to send read receipt via WebSocket');
        }
    }
}

/**
 * Handle typing indicator
 */
function handleTypingIndicator(data) {
    const userId = data.user_id;
    const isTyping = data.is_typing;
    const userName = data.user_name || 'User';
    
    // Don't show self typing
    if (userId === getCurrentUserId()) {
        return;
    }
    
    if (isTyping) {
        addTypingIndicator(userId, userName);
    } else {
        removeTypingIndicator(userId);
    }
}

/**
 * Add typing indicator for a user
 */
function addTypingIndicator(userId, userName) {
    // Clear existing timeout for this user
    if (typingUsersMap.has(userId)) {
        clearTimeout(typingUsersMap.get(userId).timeoutId);
        typingUsersMap.delete(userId);
    }
    
    // Add new typing indicator
    const typingContainer = document.getElementById('chat-messages');
    let typingEl = document.getElementById(`typing-${userId}`);
    
    if (!typingEl && typingContainer) {
        typingEl = document.createElement('div');
        typingEl.id = `typing-${userId}`;
        typingEl.className = 'message-item mb-2';
        typingEl.style.cssText = 'font-size: 12px; opacity: 0.7;';
        typingEl.innerHTML = `<em class="text-muted">${escapeHtml(userName)} is typing...</em>`;
        typingContainer.insertBefore(typingEl, typingContainer.firstChild);
        scrollToBottom();
    }
    
    // Auto-hide typing indicator after timeout
    const timeoutId = setTimeout(() => {
        const el = document.getElementById(`typing-${userId}`);
        if (el) el.remove();
        typingUsersMap.delete(userId);
    }, TYPING_TIMEOUT_MS);
    
    typingUsersMap.set(userId, { element: typingEl, timeoutId: timeoutId });
}

/**
 * Remove typing indicator for a user
 */
function removeTypingIndicator(userId) {
    if (!typingUsersMap.has(userId)) return;
    
    const { timeoutId } = typingUsersMap.get(userId);
    clearTimeout(timeoutId);
    
    const el = document.getElementById(`typing-${userId}`);
    if (el) el.remove();
    
    typingUsersMap.delete(userId);
}

/**
 * Handle read receipt
 */
function handleReadReceipt(data) {
    data.message_ids?.forEach(msgId => {
        const msgElement = document.getElementById(`msg-${msgId}`);
        if (msgElement) {
            const timeEl = msgElement.querySelector('.message-time');
            if (timeEl && !timeEl.querySelector('.fa-check-double')) {
                timeEl.innerHTML += ' <i class="fas fa-check-double" style="color: #0099ff;"></i>';
            }
        }
    });
}

/**
 * Handle message deletion
 */
function handleMessageDeleted(data) {
    const msgElement = document.getElementById(`msg-${data.message_id}`);
    if (!msgElement) return;
    
    if (data.delete_type === 'for_me') {
        // Fade out and remove only for the current viewer
        msgElement.style.transition = 'opacity 0.3s ease';
        msgElement.style.opacity = '0';
        setTimeout(() => {
            msgElement.remove();
            lastMessageCount = Math.max(0, lastMessageCount - 1);
        }, 300);
    } else if (data.delete_type === 'for_everyone') {
        // Update message to show deleted
        const bubble = msgElement.querySelector('.message-bubble');
        if (bubble) {
            bubble.className = 'message-bubble bg-light text-muted';
            const content = bubble.querySelector('.message-content');
            if (content) content.innerHTML = '<em>This message was deleted</em>';
        }
        // Remove delete buttons
        const menu = msgElement.querySelector('.message-menu-wrapper');
        if (menu) menu.remove();
    }
}

/**
 * Handle chat clear
 */
function handleChatCleared(data) {
    const container = document.getElementById('chat-messages-list');
    const emptyMsg = document.getElementById('chat-empty');
    
    if (container) {
        container.innerHTML = '';
        lastMessageCount = 0;
    }
    if (emptyMsg) emptyMsg.classList.remove('d-none');
    
    showToast('Chat cleared', 'success');
}

/**
 * Handle online status updates
 */
function handleUserOnlineStatus(data) {
    console.log(`[CHAT] User ${data.user_id} is ${data.is_online ? 'online' : 'offline'}`);
    
    // Update online status indicator in room header
    const statusEl = document.getElementById('chat-user-status');
    if (statusEl) {
        if (data.is_online) {
            statusEl.innerHTML = '<span class="status-online">●</span> Online';
        } else {
            statusEl.innerHTML = `<span class="status-offline">●</span> Offline`;
        }
    }
}

// ==================== POLLING MECHANISM ====================

/**
 * Start polling for messages and room updates
 */
function startPolling() {
    if (isPollingActive) return;
    
    isPollingActive = true;
    console.log('[CHAT] Starting polling');
    
    chatPollInterval = setInterval(async () => {
        if (currentRoomId) {
            try {
                await pollMessages(currentRoomId);
            } catch (error) {
                console.error('[CHAT] Poll error:', error);
            }
        }
        try {
            await loadChatRooms();
        } catch (error) {
            console.error('[CHAT] Room poll error:', error);
        }
    }, POLLING_INTERVAL_MS);
}

/**
 * Stop polling
 */
function stopPolling() {
    if (!isPollingActive) return;
    
    isPollingActive = false;
    if (chatPollInterval) {
        clearInterval(chatPollInterval);
        chatPollInterval = null;
    }
    console.log('[CHAT] Stopped polling');
}

/**
 * Poll messages for current room
 */
async function pollMessages(roomId) {
    try {
        const res = await fetch(`/api/chat/rooms/${roomId}/messages/`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('panchayat_token') }
        });
        
        if (!res.ok) {
            console.error('[CHAT] Message poll failed:', res.status);
            return;
        }
        
        const data = await res.json();
        const messages = Array.isArray(data) ? data : (data?.results || []);
        
        // Only update if message count changed
        if (messages.length !== lastMessageCount) {
            console.debug(`[CHAT] Message count changed: ${lastMessageCount} -> ${messages.length}`);
            lastMessageCount = messages.length;
            
            const container = document.getElementById('chat-messages-list');
            const emptyMsg = document.getElementById('chat-empty');
            
            if (!container) return;
            
            if (messages.length > 0) {
                if (emptyMsg) emptyMsg.classList.add('d-none');
                container.innerHTML =messages.map(msg => buildMessageHTML(msg)).join('');
                scrollToBottom();
            } else {
                if (emptyMsg) emptyMsg.classList.remove('d-none');
                container.innerHTML = '';
            }
        }
    } catch (error) {
        console.error('[CHAT] Error polling messages:', error);
    }
}

// ==================== CHAT ROOMS ====================

/**
 * Load and display chat rooms
 */
async function loadChatRooms() {
    const container = document.getElementById('chat-rooms-list');
    const loading = document.getElementById('chat-rooms-loading');
    
    if (!container) return;
    
    if (loading) loading.classList.remove('d-none');
    
    try {
        const token = localStorage.getItem('panchayat_token');
        if (!token) {
            if (loading) loading.classList.add('d-none');
            container.innerHTML = '<p class="text-danger p-3">Please login first</p>';
            return;
        }
        
        const res = await fetch('/api/chat/rooms/', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (!res.ok) {
            const msg = res.status === 401 ? 'Session expired' : 'Failed to load rooms';
            container.innerHTML = `<p class="text-danger p-3">${msg}</p>`;
            if (loading) loading.classList.add('d-none');
            return;
        }
        
        const data = await res.json();
        const rooms = Array.isArray(data) ? data : (data?.results || []);
        
        if (loading) loading.classList.add('d-none');
        
        if (rooms.length > 0) {
            lastRoomCount = rooms.length;
            container.innerHTML = rooms.map(room => buildRoomHTML(room)).join('');
            bindRoomItems();
            
            // Re-highlight current room
            if (currentRoomId) {
                updateRoomHighlight(currentRoomId);
            }
        } else {
            lastRoomCount = 0;
            container.innerHTML = '<p class="text-muted p-3 text-center">No conversations yet<br><small>Click "New Chat" to start</small></p>';
        }
    } catch (error) {
        console.error('[CHAT] Error loading rooms:', error);
        container.innerHTML = '<p class="text-danger p-3">Error loading conversations</p>';
        if (loading) loading.classList.add('d-none');
    }
}

/**
 * Build HTML for a chat room item
 */
function buildRoomHTML(room) {
    const other = room.other_user || {};
    const lastMsg = room.last_message || {};
    const unread = room.unread_count || 0;
    const isActive = currentRoomId === room.id ? 'active' : '';
    const lastMsgText = lastMsg.content ? (lastMsg.content.substring(0, 30) + (lastMsg.content.length > 30 ? '...' : '')) : 'No messages yet';
    
    return `
        <div class="chat-room-item ${isActive}" 
             data-room-id="${room.id}"
             data-user-name="${escapeHtml(other.name || 'Unknown')}"
             data-user-role="${escapeHtml(other.role || '')}"
             style="padding: 12px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.2s;">
            <div class="d-flex align-items-center">
                <div class="avatar avatar-sm me-2" style="background: var(--brand-primary); color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    ${(other.name || 'U').charAt(0).toUpperCase()}
                </div>
                <div class="flex-grow-1 overflow-hidden">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <strong>${escapeHtml(other.name || 'Unknown')}</strong>
                        ${unread > 0 ? `<span class="badge bg-danger ms-2">${unread}</span>` : ''}
                    </div>
                    <small class="text-muted text-truncate d-block">${escapeHtml(lastMsgText)}</small>
                </div>
            </div>
        </div>
    `;
}

/**
 * Update room highlight after render
 */
function updateRoomHighlight(roomId) {
    document.querySelectorAll('.chat-room-item').forEach(item => {
        const rid = Number(item.dataset.roomId);
        if (rid === roomId) {
            item.classList.add('active');
            item.style.background = 'var(--bg-light)';
        } else {
            item.classList.remove('active');
            item.style.background = '';
        }
    });
}

function bindRoomItems() {
    document.querySelectorAll('.chat-room-item').forEach(item => {
        const cloned = item.cloneNode(true);
        item.parentNode.replaceChild(cloned, item);
        cloned.addEventListener('click', () => {
            const roomId = Number(cloned.dataset.roomId);
            const userName = cloned.dataset.userName || 'Chat';
            const userRole = cloned.dataset.userRole || '';
            if (roomId) {
                window.selectRoom(roomId, userName, userRole);
            }
        });
    });
}

/**
 * Select/open a chat room
 */
window.selectRoom = async function(roomId, userName, userRole) {
    if (currentRoomId === roomId) return;
    
    console.log(`[CHAT] Selecting room ${roomId}`);
    
    // Close existing WebSocket
    if (chatSocket) {
        chatSocket.close();
        chatSocket = null;
    }
    wsConnected = false;
    stopPolling();
    
    // Update state
    currentRoomId = roomId;
    currentRoomName = userName;
    lastMessageCount = 0;
    
    // Update UI
    document.getElementById('chat-with-name').textContent = userName || 'Chat';
    document.getElementById('chat-with-role').textContent = userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : '';
    document.getElementById('chat-messages-list').innerHTML = '';
    document.getElementById('chat-empty').classList.add('d-none');
    
    // Highlight room
    updateRoomHighlight(roomId);
    
    // Clear typing indicators
    typingUsersMap.forEach((_, userId) => removeTypingIndicator(userId));
    
    // Connect WebSocket and load messages
    initWebSocket();
    
    // Start polling if WebSocket not connected
    if (!wsConnected) {
        setTimeout(() => {
            if (!wsConnected) {
                console.log('[CHAT] WebSocket not connected, starting polling');
                startPolling();
            }
        }, 1000);
    }
    
    // Mark messages as read
    try {
        await fetch(`/api/chat/rooms/${roomId}/mark-read/`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('panchayat_token') }
        });
    } catch (error) {
        console.error('[CHAT] Error marking read:', error);
    }
};

// ==================== MESSAGE SENDINGANDACTIONS ====================

/**
 * Send a message
 */
window.sendMessage = async function() {
    const input = document.getElementById('message-input');
    if (!input) return;
    
    const content = input.value.trim();
    if (!content) return;
    
    if (!currentRoomId) {
        showToast('Please select a conversation', 'warning');
        return;
    }
    
    console.log('[CHAT] Sending message');
    input.value = '';
    input.focus();
    
    // Try WebSocket first
    if (sendViaWebSocket('chat_message', { content })) {
        console.log('[CHAT] Sent via WebSocket');
        addMessageToUI(content);
        return;
    }
    
    // Fallback to REST API
    try {
        const res = await fetch(`/api/chat/rooms/${currentRoomId}/messages/send/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('panchayat_token')
            },
            body: JSON.stringify({ content })
        });
        
        if (!res.ok) {
            showToast('Failed to send message', 'error');
            input.value = content; // Restore content
            return;
        }
        
        const data = await res.json();
        if (data.success) {
            await loadMessages(currentRoomId);
            await loadChatRooms();
        } else {
            showToast(data.message || 'Failed to send', 'error');
            input.value = content;
        }
    } catch (error) {
        console.error('[CHAT] Send error:', error);
        showToast('Error sending message', 'error');
        input.value = content;
    }
};

/**
 * Handle Enter key in message input
 */
window.handleMessageKeyPress = function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        window.sendMessage();
        return;
    }
    
    // Send typing indicator
    if (sendViaWebSocket('typing', { is_typing: true })) {
        clearTimeout(typingTimeoutId);
        typingTimeoutId = setTimeout(() => {
            sendViaWebSocket('typing', { is_typing: false });
        }, TYPING_TIMEOUT_MS);
    }
};

/**
 * Delete message for current user only
 */
window.deleteForMe = async function(messageId) {
    if (!currentRoomId || !messageId) return;
    
    console.log('[CHAT] Delete for me:', messageId);
    
    // Optimistic UI update
    const msgEl = document.getElementById(`msg-${messageId}`);
    if (msgEl) {
        msgEl.style.opacity = '0';
        setTimeout(() => msgEl.remove(), 300);
    }
    
    // Hide menus
    document.querySelectorAll('.message-menu').forEach(m => m.style.display = 'none');
    
    // Send request
    if (sendViaWebSocket('delete_for_me', { message_id: messageId })) {
        showToast('Deleted', 'success');
        return;
    }
    
    try {
        await fetch(`/api/chat/rooms/${currentRoomId}/messages/${messageId}/delete-for-me/`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('panchayat_token') }
        });
        showToast('Deleted', 'success');
    } catch (error) {
        console.error('[CHAT] Delete error:', error);
        showToast('Failed to delete', 'error');
    }
};

/**
 * Delete message for everyone
 */
window.deleteForEveryone = async function(messageId) {
    if (!currentRoomId || !messageId) return;
    
    if (!confirm('Delete for everyone? This cannot be undone.')) return;
    
    console.log('[CHAT] Delete for everyone:', messageId);
    
    // Optimistic UI update
    const msgEl = document.getElementById(`msg-${messageId}`);
    if (msgEl) {
        const bubble = msgEl.querySelector('.message-bubble');
        if (bubble) {
            bubble.className = 'message-bubble bg-light text-muted';
            const content = bubble.querySelector('.message-content');
            if (content) content.innerHTML = '<em>This message was deleted</em>';
        }
        const menu = msgEl.querySelector('.message-menu-wrapper');
        if (menu) menu.remove();
    }
    
    // Hide menus
    document.querySelectorAll('.message-menu').forEach(m => m.style.display = 'none');
    
    // Send request
    if (sendViaWebSocket('delete_for_everyone', { message_id: messageId })) {
        showToast('Deleted for all', 'success');
        return;
    }
    
    try {
        const res = await fetch(`/api/chat/rooms/${currentRoomId}/messages/${messageId}/delete-for-everyone/`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('panchayat_token') }
        });
        const data = await res.json();
        if (data.success) {
            showToast('Deleted for all', 'success');
        } else {
            showToast(data.message || 'Failed to delete', 'error');
        }
    } catch (error) {
        console.error('[CHAT] Delete error:', error);
        showToast('Failed to delete', 'error');
    }
};

/**
 * Clear all messages in room
 */
window.clearChat = async function() {
    if (!currentRoomId) return;
    
    if (!confirm('Clear all messages for you? Other user will still see them.')) return;
    
    console.log('[CHAT] Clearing chat');
    
    // Optimistic UI update
    const container = document.getElementById('chat-messages-list');
    const emptyMsg = document.getElementById('chat-empty');
    if (container) {
        container.innerHTML = '';
        lastMessageCount = 0;
    }
    if (emptyMsg) emptyMsg.classList.remove('d-none');
    
    // Send request
    if (sendViaWebSocket('clear_chat', {})) {
        showToast('Chat cleared', 'success');
        return;
    }
    
    try {
        await fetch(`/api/chat/rooms/${currentRoomId}/clear/`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('panchayat_token') }
        });
        showToast('Chat cleared', 'success');
    } catch (error) {
        console.error('[CHAT] Clear error:', error);
        showToast('Failed to clear', 'error');
    }
};

// ==================== NEW CHAT MODAL ====================

/**
 * Open "New Chat" modal
 */
window.openNewChatModal = async function() {
    console.log('[CHAT] Opening new chat modal');
    
    try {
        const token = localStorage.getItem('panchayat_token');
        if (!token) {
            showToast('Please login first', 'error');
            return;
        }
        
        const res = await fetch('/api/chat/users/', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (!res.ok) {
            showToast('Failed to load users', 'error');
            return;
        }
        
        const data = await res.json();
        console.log('[CHAT] Users response:', data);
        if (!data.success || !data.data || data.data.length === 0) {
            showToast(data.message || 'No users available', 'info');
            return;
        }
        
        // Create modal
        const users = data.data;
        let modal = document.getElementById('newChatModal');
        
        const usersHtml = users.map(user => {
            const displayName = user.full_name || user.email || 'Unknown';
            return `
                <div class="p-2 border-bottom new-chat-user" style="cursor: pointer; transition: background 0.2s;"
                     data-user-id="${user.id}"
                     data-user-name="${escapeHtml(displayName)}"
                     data-user-role="${escapeHtml(user.role || '')}">
                    <div class="d-flex align-items-center">
                        <div class="avatar me-2" style="background: var(--brand-primary); color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                            ${escapeHtml(displayName.charAt(0).toUpperCase())}
                        </div>
                        <div>
                            <strong>${escapeHtml(displayName)}</strong>
                            <br><small class="text-muted">${escapeHtml(user.role || '')}</small>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'newChatModal';
            modal.className = 'modal fade';
            document.body.appendChild(modal);
        }
        
        modal.innerHTML = `
            <div class="modal-dialog modal-sm">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Start New Chat</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body p-0" style="max-height: 400px; overflow-y: auto;">
                        ${usersHtml}
                    </div>
                </div>
            </div>
        `;
        
        modal.querySelectorAll('.new-chat-user').forEach(item => {
            item.addEventListener('click', function() {
                const userId = parseInt(this.dataset.userId, 10);
                const userName = this.dataset.userName || 'Chat';
                const userRole = this.dataset.userRole || '';
                if (userId) {
                    window.startNewChat(userId, userName, userRole);
                }
            });
        });
        
        new bootstrap.Modal(modal).show();
    } catch (error) {
        console.error('[CHAT] Modal error:', error);
        showToast('Error loading users', 'error');
    }
};

/**
 * Start new chat with a user
 */
window.startNewChat = async function(userId, userName, userRole = '') {
    if (!userId) return;
    
    console.log(`[CHAT] Starting new chat with user ${userId}, role: ${userRole}`);
    
    try {
        const res = await fetch('/api/chat/rooms/create/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('panchayat_token')
            },
            body: JSON.stringify({ other_user_id: userId })
        });
        
        const data = await res.json();
        console.log('[CHAT] Create room response:', data);
        
        if (data.success && data.data) {
            // Close modal
            const modalEl = document.getElementById('newChatModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }
            
            // Select new room
            await loadChatRooms();
            window.selectRoom(data.data.id, userName, userRole);
        } else {
            showToast(data.message || 'Failed to create chat', 'error');
        }
    } catch (error) {
        console.error('[CHAT] Chat creation error:', error);
        showToast('Error creating chat', 'error');
    }
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * Get current user ID (from localStorage or API)
 */
function getCurrentUserId() {
    const userData = localStorage.getItem('panchayat_user');
    if (userData) {
        try {
            return JSON.parse(userData).id;
        } catch (e) {
            // parse error
        }
    }
    return null;
}

/**
 * Add message to UI immediately after sending (optimistic update)
 */
function addMessageToUI(content) {
    const container = document.getElementById('chat-messages-list');
    const emptyMsg = document.getElementById('chat-empty');
    const currentUserId = getCurrentUserId();
    
    if (!container) return;
    
    if (emptyMsg) emptyMsg.classList.add('d-none');
    
    const tempId = 'temp-' + Date.now();
    const msgData = {
        id: tempId,
        content: content,
        sender_id: currentUserId,
        sender_name: 'You',
        sender_role: '',
        created_at: new Date().toISOString(),
        is_read: false,
        is_me: true,
        is_deleted_for_everyone: false,
        can_delete: true
    };
    
    container.insertAdjacentHTML('beforeend', buildMessageHTML(msgData));
    lastMessageCount = (lastMessageCount || 0) + 1;
    scrollToBottom();
}

/**
 * Build message HTML
 */
function buildMessageHTML(msg) {
    if (!msg || !msg.id) {
        console.warn('[CHAT] Invalid message:', msg);
        return '';
    }
    
    const isMe = msg.is_me === true;
    const isDeleted = msg.is_deleted_for_everyone === true;
    const canDelete = msg.can_delete !== false;
    const isRead = msg.is_read === true;
    
    const time = formatMessageTime(msg.created_at);
    const content = isDeleted ? '<em class="text-muted">This message was deleted</em>' : escapeHtml(msg.content || '');
    const bubbleClass = isDeleted ? 'message-bubble bg-light text-muted' : (isMe ? 'message-bubble bg-primary text-white' : 'message-bubble bg-light');
    const readIcon = isMe && isRead ? ' <i class="fas fa-check-double ms-1" style="color: #0099ff;"></i>' : '';
    
    const deleteMenu = canDelete && !isDeleted ? `
        <div class="message-menu-wrapper">
            <button class="btn btn-sm message-menu-btn" onclick="window.toggleMessageMenu(${msg.id})" style="padding: 2px 6px; background: transparent; border: none;">
                <i class="fas fa-ellipsis-v"></i>
            </button>
            <div class="message-menu" id="menu-${msg.id}" style="display: none; position: absolute; right: 0; top: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); z-index: 1000; min-width: 150px;">
                <button class="w-100 text-start p-2" style="border: none; background: transparent; cursor: pointer; font-size: 13px;" onclick="window.deleteForMe(${msg.id})">
                    <i class="fas fa-trash me-2"></i>Delete for me
                </button>
                <button class="w-100 text-start p-2" style="border: none; background: transparent; cursor: pointer; font-size: 13px;" onclick="window.deleteForEveryone(${msg.id})">
                    <i class="fas fa-trash-alt me-2"></i>Delete for everyone
                </button>
            </div>
        </div>
    ` : '';
    
    return `
        <div class="message-item mb-3 ${isMe ? 'text-end' : ''}" id="msg-${msg.id}">
            <div class="d-flex ${isMe ? 'justify-content-end' : ''} align-items-flex-end" style="gap: 8px;">
                <div class="${bubbleClass}" 
                     style="max-width: 70%; padding: 10px 15px; border-radius: 15px; ${isMe ? 'border-bottom-right-radius: 3px;' : 'border-bottom-left-radius: 3px;'}">
                    <div class="message-content" style="word-wrap: break-word;">${content}</div>
                    <div class="message-time" style="font-size: 11px; ${isMe && !isDeleted ? 'color: rgba(255,255,255,0.7);' : 'color: var(--text-muted);'} margin-top: 4px;">
                        ${time}${readIcon}
                    </div>
                </div>
                ${deleteMenu}
            </div>
        </div>
    `;
}

/**
 * Toggle message delete menu
 */
window.toggleMessageMenu = function(messageId) {
    const menu = document.getElementById(`menu-${messageId}`);
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
};

/**
 * Format message timestamp
 */
function formatMessageTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Scroll messages to bottom
 */
function scrollToBottom() {
    const container = document.getElementById('chat-messages');
    if (container) {
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 0);
    }
}

/**
 * Load messages (REST fallback)
 */
async function loadMessages(roomId) {
    if (!roomId) return;
    
    try {
        const res = await fetch(`/api/chat/rooms/${roomId}/messages/`, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('panchayat_token') }
        });
        
        if (!res.ok) return;
        
        const data = await res.json();
        const messages = Array.isArray(data) ? data : (data?.results || []);
        
        const container = document.getElementById('chat-messages-list');
        const emptyMsg = document.getElementById('chat-empty');
        
        if (!container) return;
        
        if (messages.length > 0) {
            if (emptyMsg) emptyMsg.classList.add('d-none');
            container.innerHTML = messages.map(msg => buildMessageHTML(msg)).join('');
            lastMessageCount = messages.length;
            scrollToBottom();
        } else {
            if (emptyMsg) emptyMsg.classList.remove('d-none');
            container.innerHTML = '';
            lastMessageCount = 0;
        }
    } catch (error) {
        console.error('[CHAT] Load messages error:', error);
    }
}

// ==================== CLEANUP ====================

/**
 * Cleanup on page unload
 */
window.addEventListener('beforeunload', () => {
    if (chatSocket) chatSocket.close();
    stopPolling();
});

/**
 * Cleanup function
 */
window.cleanupChat = function() {
    if (chatSocket) {
        chatSocket.close();
        chatSocket = null;
    }
    wsConnected = false;
    stopPolling();
    typingUsersMap.forEach((_, userId) => removeTypingIndicator(userId));
    console.log('[CHAT] Cleanup complete');
};

// Close dropdown menus when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.message-menu-wrapper')) {
        document.querySelectorAll('.message-menu').forEach(m => m.style.display = 'none');
    }
});

console.log('[CHAT] Module initialized');

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('chat-rooms-list')) {
        initChat();
    }
});

