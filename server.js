const express = require('express');
const socketio = require('socket.io');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const speakeasy = require('speakeasy');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// MongoDB bağlantısı
mongoose.connect('mongodb://localhost:27017/chatApp', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Şifreleme anahtarı
const SECRET_KEY = crypto.randomBytes(32).toString('hex');

// Modeller
const User = require('./models/User');
const Message = require('./models/Message');
const Group = require('./models/Group');
const Call = require('./models/Call');
const Poll = require('./models/Poll');

// Middleware'ler
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Dosya yükleme ayarları
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// E-posta gönderici
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'your_email@gmail.com',
    pass: 'your_email_password'
  }
});

// API Rotası
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/calls', require('./routes/calls'));
app.use('/api/polls', require('./routes/polls'));

// Socket.io bağlantıları
io.on('connection', (socket) => {
  console.log('New client connected');
  
  // Kullanıcı giriş yaptığında
  socket.on('login', async (userId) => {
    try {
      await User.findByIdAndUpdate(userId, { status: 'online' });
      socket.userId = userId;
      io.emit('userStatus', { userId, status: 'online' });
    } catch (error) {
      console.error(error);
    }
  });
  
  // Oda katılımları
  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
  });
  
  // Oda ayrılmaları
  socket.on('leaveRoom', (roomId) => {
    socket.leave(roomId);
  });
  
  // Yeni mesaj gönderildiğinde
  socket.on('sendMessage', async (data) => {
    try {
      // Mesaj şifreleme
      const cipher = crypto.createCipheriv('aes-256-cbc', SECRET_KEY, Buffer.alloc(16, 0));
      let encrypted = cipher.update(data.content, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const message = new Message({
        sender: data.senderId,
        receiver: data.receiverId,
        room: data.roomId,
        content: encrypted,
        type: data.type,
        fileUrl: data.fileUrl
      });
      
      await message.save();
      
      // Mesaj alıcıya gönder
      if (data.roomId) {
        // Grup mesajı
        io.to(data.roomId).emit('newMessage', message);
      } else {
        // Birebir mesaj
        io.to(data.receiverId).emit('newMessage', message);
      }
    } catch (error) {
      console.error(error);
    }
  });
  
  // Arama başlatıldığında
  socket.on('startCall', async (data) => {
    try {
      const call = new Call({
        participants: data.participants,
        type: data.callType, // 'audio' or 'video'
        status: 'ringing'
      });
      
      await call.save();
      
      // Katılımcılara bildirim gönder
      data.participants.forEach(participantId => {
        if (participantId !== data.callerId) {
          io.to(participantId).emit('incomingCall', {
            callId: call._id,
            callerId: data.callerId,
            callType: data.callType
          });
        }
      });
    } catch (error) {
      console.error(error);
    }
  });
  
  // Kullanıcı çevrimdışı olduğunda
  socket.on('disconnect', async () => {
    if (socket.userId) {
      try {
        await User.findByIdAndUpdate(socket.userId, { 
          status: 'offline',
          lastSeen: new Date()
        });
        io.emit('userStatus', { userId: socket.userId, status: 'offline' });
      } catch (error) {
        console.error(error);
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
