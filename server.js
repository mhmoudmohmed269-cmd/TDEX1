const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

// Fallback for root path to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Admin path to serve admin.html
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Store active users and their locations
const activeUsers = new Map();

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    // When an admin connects, send them the current state of all users
    socket.on('admin_join', () => {
        console.log('Admin joined:', socket.id);
        socket.join('admins');
        
        // Send all currently active users to the new admin
        const usersArray = Array.from(activeUsers.entries()).map(([id, data]) => ({
            id,
            ...data
        }));
        socket.emit('initial_locations', usersArray);
    });

    // When a standard user sends their location
    socket.on('update_location', (data) => {
        // Save or update in our memory store
        activeUsers.set(socket.id, data);
        
        // Broadcast this specific update to all admins
        io.to('admins').emit('user_location_updated', {
            id: socket.id,
            ...data
        });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        if (activeUsers.has(socket.id)) {
            activeUsers.delete(socket.id);
            // Notify admins that this user disconnected
            io.to('admins').emit('user_disconnected', socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Admin Dashboard: http://localhost:${PORT}/admin`);
});
