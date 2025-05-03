import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { v4 as uuidv4 } from 'uuid';
import CryptoJS from 'crypto-js';

// Components
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import TwoFactorAuth from './components/auth/TwoFactorAuth';
import Chat from './components/chat/Chat';
import Sidebar from './components/layout/Sidebar';
import UserProfile from './components/user/UserProfile';
import GroupSettings from './components/groups/GroupSettings';
import CallScreen from './components/calls/CallScreen';
import PollCreator from './components/polls/PollCreator';

// Themes
import { lightTheme, darkTheme } from './styles/themes';
import GlobalStyle from './styles/GlobalStyle';

// Socket connection
const socket = io('http://localhost:5000', {
  transports: ['websocket'],
  upgrade: false
});

function App() {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState('light');
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [messages, setMessages] = useState([]);
  const [currentChat, setCurrentChat] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [activeCall, setActiveCall] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const callRef = useRef(null);

  // Kullanıcı giriş kontrolü
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        setUser(res.data.user);
        socket.emit('login', res.data.user._id);
        loadInitialData(res.data.user._id);
      })
      .catch(err => {
        localStorage.removeItem('token');
      });
    }
  }, []);

  // Başlangıç verilerini yükle
  const loadInitialData = async (userId) => {
    try {
      const [usersRes, groupsRes] = await Promise.all([
        axios.get('/api/users'),
        axios.get(`/api/groups?userId=${userId}`)
      ]);
      
      setUsers(usersRes.data);
      setGroups(groupsRes.data);
    } catch (error) {
      console.error('Initial data load failed:', error);
    }
  };

  // Tema değiştirme
  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  // Mesaj şifreleme
  const encryptMessage = (message) => {
    return CryptoJS.AES.encrypt(message, SECRET_KEY).toString();
  };

  // Mesaj çözme
  const decryptMessage = (encrypted) => {
    return CryptoJS.AES.decrypt(encrypted, SECRET_KEY).toString(CryptoJS.enc.Utf8);
  };

  // Mesaj gönder
  const sendMessage = (content, type = 'text', fileUrl = null) => {
    if (!user || !currentChat) return;
    
    const encryptedContent = encryptMessage(content);
    const message = {
      senderId: user._id,
      receiverId: currentChat.type === 'user' ? currentChat.id : null,
      roomId: currentChat.type === 'group' ? currentChat.id : null,
      content: encryptedContent,
      type,
      fileUrl
    };
    
    socket.emit('sendMessage', message);
    
    // Optimistik güncelleme
    setMessages(prev => [...prev, { 
      ...message, 
      _id: uuidv4(), 
      timestamp: new Date(),
      content // Şifrelenmemiş hali UI'da gösterilecek
    }]);
  };

  // Arama başlat
  const startCall = (participants, callType) => {
    const callId = uuidv4();
    const call = {
      id: callId,
      participants,
      caller: user,
      type: callType,
      status: 'ringing'
    };
    
    setActiveCall(call);
    callRef.current = call;
    
    socket.emit('startCall', {
      callId,
      participants,
      callerId: user._id,
      callType
    });
  };

  // Bildirim ekle
  const addNotification = (notification) => {
    setNotifications(prev => [...prev, notification]);
    
    // Bildirim 5 saniye sonra otomatik kapanır
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
    }, 5000);
  };

  if (!user) {
    return (
      <ThemeProvider theme={theme === 'light' ? lightTheme : darkTheme}>
        <GlobalStyle />
        <Router>
          <Routes>
            <Route path="/login" element={<Login onLogin={handleLogin} />} />
            <Route path="/register" element={<Register onRegister={handleRegister} />} />
            <Route path="/2fa" element={<TwoFactorAuth />} />
            <Route path="*" element={<Navigate to="/login" />} />
          </Routes>
        </Router>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme === 'light' ? lightTheme : darkTheme}>
      <GlobalStyle />
      <Router>
        <div className="app">
          <Sidebar 
            user={user} 
            users={users} 
            groups={groups}
            onlineUsers={onlineUsers}
            notifications={notifications}
            onSelectChat={setCurrentChat} 
            onLogout={handleLogout}
            onToggleTheme={toggleTheme}
            onCreateGroup={handleCreateGroup}
          />
          
          <Routes>
            <Route path="/chat" element={
              <Chat 
                currentUser={user} 
                currentChat={currentChat} 
                messages={messages} 
                onSendMessage={sendMessage} 
                onUploadFile={uploadFile}
                onStartCall={startCall}
                onReactToMessage={handleReaction}
              />
            } />
            <Route path="/profile" element={<UserProfile user={user} />} />
            <Route path="/group/:groupId/settings" element={
              <GroupSettings 
                group={groups.find(g => g._id === currentChat?.id)} 
                onUpdateGroup={handleUpdateGroup}
              />
            } />
            <Route path="/call" element={
              <CallScreen 
                call={activeCall} 
                onEndCall={handleEndCall}
                currentUser={user}
              />
            } />
            <Route path="/create-poll" element={
              <PollCreator 
                currentChat={currentChat}
                onCreatePoll={handleCreatePoll}
              />
            } />
            <Route path="*" element={<Navigate to="/chat" />} />
          </Routes>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
