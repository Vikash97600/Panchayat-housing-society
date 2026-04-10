// Chat functionality for Panchayat Housing Society
// Uses WebSocket for real-time messaging with REST fallback

let currentRoomId = null;
let chatPollInterval = null;
let chatSocket = null;
let wsConnected = false;
let wsReconnectAttempts = 0;
const MAX_WS_RECONNECT_ATTEMPTS = 5;

// Initialize chat when tab is shown
window.initChat = async function() {
    console.log('[CHAT] initChat called');
    
    // First load chat rooms (await it)
    await loadChatRooms();
    
    // Then try WebSocket (will return early if no room selected)
    await initWebSocket();
    if (!wsConnected) {
        console.log('[CHAT] WebSocket failed, using REST polling fallback');
        startPolling();
    }
    console.log('[CHAT] Chat initialized');
};

// WebSocket Connection
async function initWebSocket() {
    if (!currentRoomId) return;
    
    const token = localStorage.getItem('panchayat_token');
    if (!token) return;
    
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}://${window.location.host}/ws/chat/${currentRoomId}/?token=${token}`;
    
    try {
        chatSocket = new WebSocket(wsUrl);
        
        chatSocket.onopen = function(e) {
            console.log('[CHAT] WebSocket connected');
            wsConnected = true;
            wsReconnectAttempts = 0;
            stopPolling();
        };
        
        chatSocket.onmessage = function(e) {
            const data = JSON.parse(e.data);
            handleWebSocketMessage(data);
        };
        
        chatSocket.onclose = function(e) {
            console.log('[CHAT] WebSocket closed:', e.code, e.reason);
            wsConnected = false;
            
            if (e.code !== 1000 && wsReconnectAttempts < MAX_WS_RECONNECT_ATTEMPTS) {
                wsReconnectAttempts++;
                console.log(`[CHAT] WebSocket reconnect attempt ${wsReconnectAttempts}`);
                setTimeout(initWebSocket, 2000 * wsReconnectAttempts);
            } else {
                console.log('[CHAT] WebSocket failed, falling back to REST polling');
                startPolling();
            }
        };
        
        chatSocket.onerror = function(e) {
            console.error('[CHAT] WebSocket error:', e);
        };
    } catch (error) {
        console.error('[CHAT] WebSocket connection error:', error);
    }
}

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'initial_messages':
            loadInitialMessages(data.messages);
            break;
        case 'chat_message':
            receiveMessage(data.message);
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
    }
}

function loadInitialMessages(messages) {
    const container = document.getElementById('chat-messages-list');
    const emptyMsg = document.getElementById('chat-empty');
    
    if (!container) return;
    
    if (messages && messages.length > 0) {
        if (emptyMsg) emptyMsg.classList.add('d-none');
        container.innerHTML = messages.map(msg => buildMessageHTML(msg)).join('');
        
        scrollToBottom();
    }
}

function buildMessageHTML(msg) {
    const isMe = msg.is_me;
    const time = formatMessageTime(msg.created_at);
    const isDeleted = msg.is_deleted_for_everyone;
    const canDelete = msg.can_delete;
    const isRead = msg.is_read;
    
    const content = isDeleted ? '<em class="text-muted">This message was deleted</em>' : escapeHtml(msg.content);
    const bubbleClass = isDeleted ? 'bg-light text-muted' : (isMe ? 'bg-primary text-white' : 'bg-light');
    const readIcon = isMe && isRead ? '<i class="fas fa-check-double ms-1"></i>' : '';
    
    const menuButton = canDelete && !isDeleted ? `
        <div class="message-menu-wrapper" style="position: relative;">
            <button class="btn btn-sm message-menu-btn" onclick="toggleMessageMenu(${msg.id})" style="padding: 2px 6px; background: transparent; border: none;">
                <i class="fas fa-ellipsis-v"></i>
            </button>
            <div class="message-menu" id="menu-${msg.id}" style="display: none; position: absolute; right: 0; top: 20px; background: white; border-radius: 8px; box-shadow: var(--shadow-lg); z-index: 100; min-width: 140px;">
                <button class="dropdown-item" onclick="deleteForMe(${msg.id})" style="padding: 8px 12px; width: 100%; text-align: left; border: none; background: transparent;">
                    <i class="fas fa-trash me-2"></i>Delete for me
                </button>
                <button class="dropdown-item" onclick="deleteForEveryone(${msg.id})" style="padding: 8px 12px; width: 100%; text-align: left; border: none; background: transparent;">
                    <i class="fas fa-trash-alt me-2"></i>Delete for everyone
                </button>
            </div>
        </div>
    ` : '';
    
    return `
        <div class="message-item mb-3 ${isMe ? 'text-end' : ''}" id="msg-${msg.id}">
            <div class="d-flex ${isMe ? 'justify-content-end' : ''}" style="position: relative;">
                <div class="message-bubble ${bubbleClass}" 
                     style="max-width: 70%; padding: 10px 15px; border-radius: 15px; ${isMe ? 'border-bottom-right-radius: 3px;' : 'border-bottom-left-radius: 3px';}">
                    <div class="message-content">${content}</div>
                    <div class="message-time" style="font-size: 11px; ${isMe && !isDeleted ? 'color: rgba(255,255,255,0.7);' : 'color: var(--text-muted);'} margin-top: 4px;">
                        ${time} ${readIcon}
                    </div>
                </div>
                ${menuButton}
            </div>
        </div>
    `;
}

function receiveMessage(msg) {
    const container = document.getElementById('chat-messages-list');
    const emptyMsg = document.getElementById('chat-empty');
    
    if (!container) return;
    
    if (emptyMsg) emptyMsg.classList.add('d-none');
    
    // Add default fields if not present (for real-time messages)
    const msgData = {
        ...msg,
        can_delete: msg.can_delete !== false,
        is_deleted_for_everyone: msg.is_deleted_for_everyone || false
    };
    
    container.insertAdjacentHTML('beforeend', buildMessageHTML(msgData));
    scrollToBottom();
    
    // Update chat rooms list to show new message
    loadChatRooms();
    
    // Send read receipt if not own message
    if (!msg.is_me && chatSocket && wsConnected) {
        chatSocket.send(JSON.stringify({
            type: 'mark_read',
            message_ids: [msg.id]
        }));
    }
}

function handleTypingIndicator(data) {
    // This is called when receiving typing indicator from OTHER users
    // The consumer already filters out self, so we just handle display
    const typingContainer = document.getElementById('chat-messages');
    const typingEl = document.getElementById('typing-indicator');
    
    if (data.is_typing) {
        if (!typingEl && typingContainer) {
            const indicator = document.createElement('div');
            indicator.id = 'typing-indicator';
            indicator.className = 'text-muted typing-indicator';
            indicator.style.cssText = 'font-size: 12px; padding: 4px 8px; margin: 4px 0;';
            indicator.innerHTML = '<em>Other user is typing...</em>';
            typingContainer.appendChild(indicator);
            scrollToBottom();
        }
    } else {
        if (typingEl) {
            typingEl.remove();
        }
    }
}

function handleReadReceipt(data) {
    data.message_ids.forEach(msgId => {
        const msgElement = document.getElementById(`msg-${msgId}`);
        if (msgElement) {
            const tickElement = msgElement.querySelector('.message-time');
            if (tickElement && !tickElement.querySelector('.fa-check-double')) {
                tickElement.innerHTML += ' <i class="fas fa-check-double"></i>';
            }
        }
    });
}

function handleMessageDeleted(data) {
    const msgElement = document.getElementById(`msg-${data.message_id}`);
    if (!msgElement) return;
    
    if (data.delete_type === 'for_me') {
        msgElement.style.transition = 'opacity 0.3s ease';
        msgElement.style.opacity = '0';
        setTimeout(() => msgElement.remove(), 300);
    } else if (data.delete_type === 'for_everyone') {
        const bubble = msgElement.querySelector('.message-bubble');
        if (bubble) {
            bubble.className = 'message-bubble bg-light text-muted';
            const content = bubble.querySelector('.message-content');
            if (content) content.innerHTML = '<em>This message was deleted</em>';
            const menu = msgElement.querySelector('.message-menu-wrapper');
            if (menu) menu.remove();
        }
    }
}

function handleChatCleared(data) {
    const container = document.getElementById('chat-messages-list');
    const emptyMsg = document.getElementById('chat-empty');
    if (container) {
        container.innerHTML = '';
        if (emptyMsg) emptyMsg.classList.remove('d-none');
    }
    showToast('Chat cleared', 'success');
}

function handleUserOnlineStatus(data) {
    console.log('[CHAT] User', data.user_id, 'is', data.is_online ? 'online' : 'offline');
}

function sendTypingIndicator(isTyping) {
    if (chatSocket && wsConnected) {
        chatSocket.send(JSON.stringify({
            type: 'typing',
            is_typing: isTyping
        }));
        
        // Show typing indicator for self in chat area
        const typingContainer = document.getElementById('chat-messages');
        const existingIndicator = document.getElementById('self-typing-indicator');
        
        if (isTyping) {
            if (!existingIndicator && typingContainer) {
                const indicator = document.createElement('div');
                indicator.id = 'self-typing-indicator';
                indicator.className = 'text-muted';
                indicator.style.cssText = 'font-size: 12px; padding: 4px 8px; margin: 4px 0;';
                indicator.innerHTML = '<em>You are typing...</em>';
                typingContainer.appendChild(indicator);
                scrollToBottom();
            }
        } else {
            if (existingIndicator) existingIndicator.remove();
        }
    }
}

// Load all chat rooms
let lastRoomsCount = 0;

async function loadChatRooms() {
    const container = document.getElementById('chat-rooms-list');
    const loading = document.getElementById('chat-rooms-loading');
    
    if (!container) return;
    if (loading) loading.classList.remove('d-none');
    
    try {
        const token = localStorage.getItem('panchayat_token');
        if (!token) {
            container.innerHTML = '<div class="text-center text-danger py-4"><p>Please login first</p></div>';
            return;
        }
        
        const res = await fetch('/api/chat/rooms/', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        console.log('[CHAT] Rooms response status:', res.status);
        
        if (!res.ok) {
            console.error('[CHAT] Failed to load rooms, status:', res.status);
            if (loading) loading.classList.add('d-none');
            
            if (res.status === 401) {
                container.innerHTML = '<div class="text-center text-danger py-4"><p>Session expired. Please login again.</p></div>';
            } else if (res.status === 403) {
                container.innerHTML = '<div class="text-center text-danger py-4"><p>You do not have permission to access chat.</p></div>';
            } else {
                container.innerHTML = '<div class="text-center text-danger py-4"><p>Failed to load conversations.</p></div>';
            }
            return;
        }
        
        const data = await res.json();
        console.log('[CHAT] Raw response data:', data);
        
        // Handle different response formats
        let roomsData = [];
        if (Array.isArray(data)) {
            roomsData = data;
        } else if (data && typeof data === 'object' && Array.isArray(data.results)) {
            roomsData = data.results;
        } else if (data && typeof data === 'object' && data.count !== undefined) {
            // Handle paginated response with results
            roomsData = data.results || [];
        }
        
        console.log('[CHAT] Parsed rooms data:', roomsData, 'length:', roomsData.length);
        
        // Always clear loading spinner and render
        if (loading) loading.classList.add('d-none');
        
        if (roomsData && roomsData.length > 0) {
            console.log('[CHAT] Rendering', roomsData.length, 'rooms');
            container.innerHTML = roomsData.map(room => {
                const otherUser = room.other_user || {};
                const lastMsg = room.last_message || {};
                const unread = room.unread_count || 0;
                const isActive = currentRoomId === room.id ? 'active' : '';
                
                return `
                    <div class="chat-room-item ${isActive}" onclick="selectRoom(${room.id}, '${otherUser.name || ''}', '${otherUser.role || ''}')" 
                         style="padding: 12px; border-bottom: 1px solid var(--border); cursor: pointer;">
                        <div class="d-flex align-items-center">
                            <div class="avatar avatar-sm me-2" style="background: var(--brand-primary); color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                ${(otherUser.name || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div class="flex-grow-1 overflow-hidden">
                                <div class="d-flex justify-content-between align-items-center">
                                    <strong class="text-truncate">${otherUser.name || 'Unknown'}</strong>
                                    ${unread > 0 ? `<span class="badge bg-danger">${unread}</span>` : ''}
                                </div>
                                <small class="text-muted text-truncate d-block">
                                    ${lastMsg.content ? (lastMsg.content.substring(0, 25) + (lastMsg.content.length > 25 ? '...' : '')) : 'No messages yet'}
                                </small>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            lastRoomsCount = roomsData.length;
        } else {
            console.log('[CHAT] No rooms found, showing empty message');
            container.innerHTML = '<div class="text-center text-muted py-4"><p>No conversations yet.<br><small>Click "New Chat" to start a conversation.</small></p></div>';
            lastRoomsCount = 0;
        }
    } catch (error) {
        console.error('Error loading chat rooms:', error);
        if (loading) loading.classList.add('d-none');
    }
}

// Select a chat room
window.selectRoom = function(roomId, userName, userRole) {
    if (currentRoomId === roomId) return;
    
    if (chatSocket) {
        chatSocket.close();
        chatSocket = null;
    }
    wsConnected = false;
    
    currentRoomId = roomId;
    lastMessageCount = 0;
    
    const container = document.getElementById('chat-messages-list');
    if (container) container.innerHTML = '';
    
    // Update UI
    document.getElementById('chat-with-name').textContent = userName || 'Chat';
    document.getElementById('chat-with-role').textContent = userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : '';
    document.getElementById('chat-empty').classList.add('d-none');
    
    // Highlight selected room - remove from all, add to current
    document.querySelectorAll('.chat-room-item').forEach(item => {
        item.classList.remove('active');
        item.style.background = '';
    });
    const clickedItem = window.event ? window.event.target.closest('.chat-room-item') : null;
    if (clickedItem) {
        clickedItem.classList.add('active');
        clickedItem.style.setProperty('background', 'var(--brand-light)', 'important');
    }
    
    initWebSocket();
    
    if (!wsConnected) {
        loadMessages(roomId);
    }
    
    markMessagesRead(roomId);
};

// Load messages for a room
let lastMessageCount = 0;

async function loadMessages(roomId) {
    console.log('[CHAT] loadMessages called for room:', roomId);
    
    const container = document.getElementById('chat-messages-list');
    const emptyMsg = document.getElementById('chat-empty');
    
    if (!container) {
        console.error('[CHAT] chat-messages-list container not found');
        return;
    }
    
    try {
        const res = await fetch(`/api/chat/rooms/${roomId}/messages/`, {
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('panchayat_token')
            }
        });
        
        console.log('[CHAT] Messages response status:', res.status);
        
        const data = await res.json();
        
        // Handle different response formats
        let messagesData = [];
        if (Array.isArray(data)) {
            messagesData = data;
        } else if (data && data.results && Array.isArray(data.results)) {
            messagesData = data.results;
        }
        console.log('[CHAT] Messages array:', messagesData);
        
        // Only update DOM if message count changed or first load
        if (messagesData.length !== lastMessageCount || (messagesData.length > 0 && container.innerHTML === '')) {
            lastMessageCount = messagesData.length;
            
            if (messagesData && messagesData.length > 0) {
                if (emptyMsg) emptyMsg.classList.add('d-none');
                container.innerHTML = messagesData.map(msg => buildMessageHTML(msg)).join('');
                scrollToBottom();
            } else {
                if (emptyMsg) emptyMsg.classList.remove('d-none');
                container.innerHTML = '';
            }
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Send a message
window.sendMessage = async function() {
    console.log('[CHAT] sendMessage called, currentRoomId:', currentRoomId);
    
    if (!currentRoomId) {
        alert('Please select a conversation first');
        return;
    }
    
    const input = document.getElementById('message-input');
    if (!input) {
        alert('Message input not found');
        return;
    }
    
    const content = input.value.trim();
    if (!content) return;
    
    console.log('[CHAT] Sending message:', content);
    
    if (chatSocket && wsConnected) {
        chatSocket.send(JSON.stringify({
            type: 'chat_message',
            content: content
        }));
        input.value = '';
        return;
    }
    
    try {
        const res = await fetch(`/api/chat/rooms/${currentRoomId}/messages/send/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('panchayat_token')
            },
            body: JSON.stringify({ content })
        });
        
        console.log('[CHAT] Send response status:', res.status);
        
        const data = await res.json();
        console.log('[CHAT] Send response data:', data);
        
        if (data.success) {
            input.value = '';
            loadMessages(currentRoomId);
            loadChatRooms();
        } else {
            alert(data.message || 'Failed to send message');
        }
    } catch (error) {
        console.error('[CHAT] Error sending message:', error);
        alert('Failed to send message: ' + error.message);
    }
};

// Add message to UI immediately (called when socket message is sent)
window.addSentMessageToUI = function(content, messageId) {
    const container = document.getElementById('chat-messages-list');
    const emptyMsg = document.getElementById('chat-empty');
    
    if (!container) return;
    
    if (emptyMsg) emptyMsg.classList.add('d-none');
    
    const now = new Date().toISOString();
    const msgData = {
        id: messageId || Date.now(),
        content: content,
        created_at: now,
        is_read: false,
        is_me: true,
        can_delete: true,
        is_deleted_for_everyone: false
    };
    
    container.insertAdjacentHTML('beforeend', buildMessageHTML(msgData));
    scrollToBottom();
    loadChatRooms();
};

// Handle Enter key in message input
let typingTimeout = null;

window.handleMessageKeyPress = function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        window.sendMessage();
    } else {
        sendTypingIndicator(true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => sendTypingIndicator(false), 2000);
    }
};

// Mark messages as read
async function markMessagesRead(roomId) {
    try {
        await fetch(`/api/chat/rooms/${roomId}/mark-read/`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('panchayat_token')
            }
        });
    } catch (error) {
        console.error('Error marking messages as read:', error);
    }
}

// Open new chat modal
window.openNewChatModal = async function() {
    console.log('[CHAT] openNewChatModal called');
    try {
        const token = localStorage.getItem('panchayat_token');
        if (!token) {
            showToast('Please login first', 'error');
            return;
        }
        
        const res = await fetch('/api/chat/users/', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        console.log('[CHAT] Users response status:', res.status);
        
        if (!res.ok) {
            console.error('[CHAT] Failed to load users, status:', res.status);
            showToast('Failed to load users', 'error');
            return;
        }
        
        const data = await res.json();
        console.log('[CHAT] Users data:', data);
        
        if (data.success && data.data && data.data.length > 0) {
            let usersHtml = data.data.map(user => `
                <div class="user-option p-2 border-bottom" style="cursor: pointer;" onclick="startNewChat(${user.id}, '${user.full_name || user.email}')">
                    <div class="d-flex align-items-center">
                        <div class="avatar avatar-sm me-2" style="background: var(--brand-primary); color: white;">
                            ${(user.full_name || user.email || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <strong>${user.full_name || user.email}</strong>
                            <br><small class="text-muted">${user.role}</small>
                        </div>
                    </div>
                </div>
            `).join('');
            
            // Create modal if not exists
            let modal = document.getElementById('newChatModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'newChatModal';
                modal.className = 'modal fade';
                modal.innerHTML = `
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Start New Chat</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body p-0" id="chat-users-list">
                                ${usersHtml}
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
            } else {
                document.getElementById('chat-users-list').innerHTML = usersHtml;
            }
            
            new bootstrap.Modal(modal).show();
        } else {
            showToast('No users available to chat with', 'info');
        }
    } catch (error) {
        console.error('Error loading chat users:', error);
        showToast('Failed to load users', 'error');
    }
};

// Start a new chat
window.startNewChat = async function(userId, userName) {
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
        
        if (data.success) {
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('newChatModal')).hide();
            
            // Select the new room
            selectRoom(data.data.id, userName, 'resident');
            loadChatRooms();
        } else {
            showToast(data.message || 'Failed to create chat', 'error');
        }
    } catch (error) {
        console.error('Error creating chat:', error);
        showToast('Failed to create chat', 'error');
    }
};

// Format message time
function formatMessageTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Scroll to bottom of chat
function scrollToBottom() {
    const container = document.getElementById('chat-messages');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Start polling for new messages
let isPollingStarted = false;

function startPolling() {
    if (isPollingStarted) return; // Prevent duplicate polling
    isPollingStarted = true;
    
    chatPollInterval = setInterval(() => {
        if (currentRoomId) {
            loadMessages(currentRoomId);
        }
        loadChatRooms();
    }, 3000); // Poll every 3 seconds
}

// Stop polling
function stopPolling() {
    if (chatPollInterval) {
        clearInterval(chatPollInterval);
        chatPollInterval = null;
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (chatSocket) {
        chatSocket.close();
    }
    stopPolling();
});

// Window cleanup function
window.cleanupChat = function() {
    if (chatSocket) {
        chatSocket.close();
        chatSocket = null;
    }
    wsConnected = false;
    stopPolling();
};

// Message menu functions
window.toggleMessageMenu = function(messageId) {
    const menu = document.getElementById(`menu-${messageId}`);
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
};

window.deleteForMe = async function(messageId) {
    if (!currentRoomId || !messageId) return;
    
    // Update UI immediately - remove message from view
    const msgElement = document.getElementById(`msg-${messageId}`);
    if (msgElement) {
        msgElement.style.transition = 'opacity 0.3s ease';
        msgElement.style.opacity = '0';
        setTimeout(() => msgElement.remove(), 300);
    }
    showToast('Message deleted', 'success');
    
    if (chatSocket && wsConnected) {
        chatSocket.send(JSON.stringify({
            type: 'delete_for_me',
            message_id: messageId
        }));
    } else {
        try {
            await fetch(`/api/chat/rooms/${currentRoomId}/messages/${messageId}/delete-for-me/`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('panchayat_token') }
            });
        } catch (error) {
            console.error('Error deleting message:', error);
        }
    }
    
    document.querySelectorAll('.message-menu').forEach(m => m.style.display = 'none');
};

window.deleteForEveryone = async function(messageId) {
    if (!currentRoomId || !messageId) return;
    
    if (!confirm('Delete this message for everyone? This action cannot be undone.')) return;
    
    // Update UI immediately - show deleted message
    const msgElement = document.getElementById(`msg-${messageId}`);
    if (msgElement) {
        const bubble = msgElement.querySelector('.message-bubble');
        if (bubble) {
            bubble.className = 'message-bubble bg-light text-muted';
            const content = bubble.querySelector('.message-content');
            if (content) content.innerHTML = '<em>This message was deleted</em>';
        }
        const menu = msgElement.querySelector('.message-menu-wrapper');
        if (menu) menu.remove();
    }
    showToast('Message deleted for everyone', 'success');
    
    if (chatSocket && wsConnected) {
        chatSocket.send(JSON.stringify({
            type: 'delete_for_everyone',
            message_id: messageId
        }));
    } else {
        try {
            const res = await fetch(`/api/chat/rooms/${currentRoomId}/messages/${messageId}/delete-for-everyone/`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('panchayat_token') }
            });
            const data = await res.json();
            if (!data.success) {
                showToast(data.message || 'Failed to delete message', 'error');
            }
        } catch (error) {
            console.error('Error deleting message:', error);
        }
    }
    
    document.querySelectorAll('.message-menu').forEach(m => m.style.display = 'none');
};

window.clearChat = async function() {
    if (!currentRoomId) return;
    
    if (!confirm('Clear all messages in this chat? This will hide all messages for you only.')) return;
    
    // Update UI immediately - clear all messages
    const container = document.getElementById('chat-messages-list');
    const emptyMsg = document.getElementById('chat-empty');
    if (container) container.innerHTML = '';
    if (emptyMsg) emptyMsg.classList.remove('d-none');
    showToast('Chat cleared', 'success');
    
    if (chatSocket && wsConnected) {
        chatSocket.send(JSON.stringify({
            type: 'clear_chat'
        }));
    } else {
        try {
            await fetch(`/api/chat/rooms/${currentRoomId}/clear/`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('panchayat_token') }
            });
        } catch (error) {
            console.error('Error clearing chat:', error);
        }
    }
};

// Close menus when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.message-menu-wrapper')) {
        document.querySelectorAll('.message-menu').forEach(m => m.style.display = 'none');
    }
});

// Export functions to window
window.initChat = initChat;
window.selectRoom = selectRoom;
window.sendMessage = sendMessage;
window.handleMessageKeyPress = handleMessageKeyPress;
window.openNewChatModal = openNewChatModal;
window.startNewChat = startNewChat;
window.stopPolling = stopPolling;
window.cleanupChat = cleanupChat;
window.deleteForMe = deleteForMe;
window.deleteForEveryone = deleteForEveryone;
window.clearChat = clearChat;
window.toggleMessageMenu = toggleMessageMenu;

console.log('[CHAT] Chat JS loaded with WebSocket support');