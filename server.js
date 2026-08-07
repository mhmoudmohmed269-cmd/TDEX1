const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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


    // --- CHAT LOGIC ---
    socket.on('user_join_chat', (username) => {
        chatUsers.set(socket.id, username);
        onlineChatUsersCount++;
        
        // Notify everyone about count
        io.emit('online_users_count', onlineChatUsersCount);
        
        // Notify others that someone joined
        socket.broadcast.emit('user_joined_notice', username);
    });

    socket.on('chat_message', (data) => {
        // Broadcast message to everyone EXCEPT sender
        socket.broadcast.emit('chat_message', data);
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
