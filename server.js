const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);

const users = {};

app.use(express.static('public'));

io.on('connection', socket => {
  socket.on('join-room', () => {
    users[socket.id] = socket.id;
    console.log(`User connected: ${socket.id}`);
    
    socket.broadcast.emit('user-connected', socket.id);

    socket.on('offer', (payload) => {
      io.to(payload.target).emit('offer', { 
        from: socket.id, 
        sdp: payload.sdp 
      });
    });

    socket.on('answer', (payload) => {
      io.to(payload.target).emit('answer', { 
        from: socket.id, 
        sdp: payload.sdp 
      });
    });

    socket.on('ice-candidate', (incoming) => {
      io.to(incoming.target).emit('ice-candidate', { 
        from: socket.id, 
        candidate: incoming.candidate 
      });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      delete users[socket.id];
      socket.broadcast.emit('user-disconnected', socket.id);
    });
  });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));