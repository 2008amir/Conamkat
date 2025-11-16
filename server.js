// server.js (Node.js Signaling Server)
const WebSocket = require('ws');
const http = require('http');
const express = require('express');

const app = express();
// Serve static files (index.html, style.css, etc.)
app.use(express.static('.')); 

const PORT = process.env.PORT || 3000; // CORRECTED: Use host's PORT environment variable

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Room management: { RoomID: { host: WebSocket, joiners: [WebSocket, ...], chat: [] } }
const rooms = {}; 

wss.on('connection', (ws) => {
    console.log('Client connected.');

    // Custom properties for the WebSocket connection
    ws.id = Math.random().toString(36).substring(2, 10);
    ws.roomID = null;
    ws.isHost = false;

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        console.log(`Received: ${data.type}`);

        switch (data.type) {
            // 1. Room Creation/Joining
            case 'create_room':
                const roomID = Math.random().toString(36).substring(2, 9);
                rooms[roomID] = { host: ws, joiners: new Set(), chat: [] };
                ws.roomID = roomID;
                ws.isHost = true;
                ws.send(JSON.stringify({ type: 'room_created', roomID: roomID }));
                break;

            case 'join_room':
                if (rooms[data.roomID]) {
                    ws.roomID = data.roomID;
                    rooms[data.roomID].joiners.add(ws);
                    
                    // Notify host (Join notifications)
                    rooms[data.roomID].host.send(JSON.stringify({ type: 'user_joined', userID: ws.id, userName: data.userName }));
                    
                    // Send chat history to new joiner
                    ws.send(JSON.stringify({ type: 'chat_history', messages: rooms[data.roomID].chat }));
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found.' }));
                }
                break;

            // 11. WebRTC Signaling (Offers, Answers, ICE Candidates)
            case 'webrtc_signal':
                const room = rooms[data.roomID];
                if (!room) return;

                if (data.to === 'host' && room.host) {
                    room.host.send(JSON.stringify({ ...data, from: ws.id }));
                } else if (data.to && room.joiners.has(data.to)) {
                    // Find specific joiner to relay to
                    for (let joiner of room.joiners) {
                        if (joiner.id === data.to) {
                            joiner.send(JSON.stringify({ ...data, from: ws.id }));
                            break;
                        }
                    }
                } else if (data.to === 'all_joiners') {
                    // Host broadcasting to all joiners (e.g., initial stream offer)
                    room.joiners.forEach(joiner => joiner.send(JSON.stringify({ ...data, from: ws.id })));
                }
                break;
            
            // 4. Question Requests
            case 'raise_hand': // Question requests
                if (ws.roomID && rooms[ws.roomID]?.host) {
                    rooms[ws.roomID].host.send(JSON.stringify({ 
                        type: 'question_request', 
                        userID: ws.id, 
                        userName: data.userName // Sent from frontend
                    }));
                }
                break;
                
            case 'unmute_command': // Unmute commands
                // Relay to specific user (Joiner)
                rooms[data.roomID].joiners.forEach(joiner => {
                    if (joiner.id === data.targetUserID) {
                        joiner.send(JSON.stringify({ type: 'unmute_allowed' }));
                    }
                });
                break;
            
            case 'mute_command': // Mute commands
                // Relay to specific user (Joiner)
                rooms[data.roomID].joiners.forEach(joiner => {
                    if (joiner.id === data.targetUserID) {
                        joiner.send(JSON.stringify({ type: 'mute_enforced' }));
                    }
                });
                break;
                
            // 12. Real-Time Chat
            case 'chat_message':
                if (ws.roomID && rooms[ws.roomID]) {
                    const messageObject = {
                        senderID: ws.id,
                        senderName: data.userName,
                        text: data.text,
                        timestamp: Date.now()
                    };
                    rooms[ws.roomID].chat.push(messageObject);
                    
                    // Broadcast to everyone in the room (Host + Joiners)
                    rooms[ws.roomID].host.send(JSON.stringify({ type: 'new_chat_message', message: messageObject }));
                    rooms[ws.roomID].joiners.forEach(joiner => joiner.send(JSON.stringify({ type: 'new_chat_message', message: messageObject })));
                }
                break;
                
            case 'end_class':
                if (ws.isHost && rooms[data.roomID]) {
                    // Host disconnected: end the room for everyone
                    rooms[data.roomID].joiners.forEach(joiner => 
                        joiner.send(JSON.stringify({ type: 'class_ended' }))
                    );
                    delete rooms[data.roomID];
                }
                break;
        }
    });

    ws.on('close', () => {
        // Handle disconnection and cleanup
        if (ws.roomID && rooms[ws.roomID]) {
            if (ws.isHost) {
                // Host disconnected: end the room for everyone
                rooms[ws.roomID].joiners.forEach(joiner => 
                    joiner.send(JSON.stringify({ type: 'class_ended' }))
                );
                delete rooms[ws.roomID];
            } else {
                // Joiner disconnected: remove from set and notify host
                rooms[ws.roomID].joiners.delete(ws);
                if (rooms[ws.roomID].host) {
                    rooms[ws.roomID].host.send(JSON.stringify({ type: 'user_left', userID: ws.id }));
                }
            }
        }
        console.log('Client disconnected.');
    });
});

server.listen(PORT, () => {
    console.log(`GlassCall Server running on port ${PORT}`);
});