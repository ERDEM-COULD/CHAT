const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const speakeasy = require('speakeasy');

const UserSchema = new mongoose.Schema({
  // Kimlik Bilgileri
  username: {
    type: String,
    required: [true, 'Kullanıcı adı gereklidir'],
    unique: true,
    trim: true,
    maxlength: [20, 'Kullanıcı adı 20 karakterden fazla olamaz']
  },
  email: {
    type: String,
    required: [true, 'E-posta gereklidir'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Geçerli bir e-posta adresi girin'
    ]
  },
  password: {
    type: String,
    required: [true, 'Şifre gereklidir'],
    minlength: [6, 'Şifre en az 6 karakter olmalıdır'],
    select: false
  },
  avatar: {
    type: String,
    default: 'default_avatar.png'
  },
  bio: {
    type: String,
    maxlength: [150, 'Biyografi 150 karakterden fazla olamaz']
  },

  // Durum Bilgileri
  status: {
    type: String,
    enum: ['online', 'offline', 'away', 'busy'],
    default: 'offline'
  },
  lastSeen: {
    type: Date
  },
  active: {
    type: Boolean,
    default: true
  },

  // Güvenlik Ayarları
  twoFactorSecret: {
    type: String,
    select: false
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  knownIPs: [{
    ip: String,
    location: String,
    firstSeen: Date,
    lastSeen: Date
  }],
  suspiciousIPs: [{
    ip: String,
    reason: String,
    detectedAt: Date
  }],
  loginHistory: [{
    ip: String,
    device: String,
    browser: String,
    os: String,
    location: String,
    timestamp: Date
  }],
  securityAlerts: [{
    type: {
      type: String,
      enum: ['new_device', 'suspicious_login', 'password_change', '2fa_enabled']
    },
    message: String,
    read: {
      type: Boolean,
      default: false
    },
    timestamp: Date
  }],
  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  sessions: [{
    token: String,
    ip: String,
    userAgent: String,
    expiresAt: Date,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Kullanıcı Ayarları
  settings: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'light'
    },
    notifications: {
      message: {
        type: Boolean,
        default: true
      },
      group: {
        type: Boolean,
        default: true
      },
      call: {
        type: Boolean,
        default: true
      },
      sound: {
        type: Boolean,
        default: true
      },
      vibration: {
        type: Boolean,
        default: true
      }
    },
    privacy: {
      lastSeen: {
        type: String,
        enum: ['everyone', 'contacts', 'nobody'],
        default: 'everyone'
      },
      profilePhoto: {
        type: String,
        enum: ['everyone', 'contacts', 'nobody'],
        default: 'everyone'
      },
      status: {
        type: String,
        enum: ['everyone', 'contacts', 'nobody'],
        default: 'everyone'
      },
      readReceipts: {
        type: Boolean,
        default: true
      }
    },
    language: {
      type: String,
      default: 'tr'
    },
    timezone: {
      type: String,
      default: 'Europe/Istanbul'
    }
  },

  // İstatistikler
  stats: {
    messageCount: {
      type: Number,
      default: 0
    },
    mediaCount: {
      type: Number,
      default: 0
    },
    loginCount: {
      type: Number,
      default: 0
    },
    lastActive: Date
  },

  // Sistem Bilgileri
  role: {
    type: String,
    enum: ['user', 'moderator', 'admin'],
    default: 'user'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date,
  deletedAt: Date
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Şifre hashleme middleware'i
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// JWT Token oluşturma metodu
UserSchema.methods.generateAuthToken = function(ip, userAgent) {
  const token = jwt.sign(
    { id: this._id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );

  // Oturumu kaydet
  this.sessions.push({
    token,
    ip,
    userAgent,
    expiresAt: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000)
  });

  return token;
};

// 2FA secret oluşturma
UserSchema.methods.generate2FASecret = function() {
  const secret = speakeasy.generateSecret({
    name: `ChatApp:${this.email}`,
    length: 20
  });

  this.twoFactorSecret = secret.base32;
  return {
    secret: secret.base32,
    otpauthUrl: secret.otpauth_url
  };
};

// 2FA doğrulama
UserSchema.methods.verify2FAToken = function(token) {
  return speakeasy.totp.verify({
    secret: this.twoFactorSecret,
    encoding: 'base32',
    token,
    window: 1
  });
};

// Şifre doğrulama
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// IP kontrolü
UserSchema.methods.checkIP = function(ip) {
  const isKnown = this.knownIPs.some(known => known.ip === ip);
  const isSuspicious = this.suspiciousIPs.some(susp => susp.ip === ip);
  
  return {
    isKnown,
    isSuspicious,
    shouldAlert: !isKnown
  };
};

// Kullanıcı engelleme
UserSchema.methods.blockUser = async function(userId) {
  if (!this.blockedUsers.includes(userId)) {
    this.blockedUsers.push(userId);
    await this.save();
  }
};

// Kullanıcı engellemeyi kaldırma
UserSchema.methods.unblockUser = async function(userId) {
  this.blockedUsers = this.blockedUsers.filter(id => id.toString() !== userId.toString());
  await this.save();
};

// Sanal alanlar
UserSchema.virtual('isOnline').get(function() {
  return this.status === 'online';
});

UserSchema.virtual('formattedLastSeen').get(function() {
  if (this.isOnline) return 'Çevrimiçi';
  if (!this.lastSeen) return 'Hiç çevrimiçi olmadı';
  
  const now = new Date();
  const diff = now - this.lastSeen;
  const minutes = Math.floor(diff / 60000);
  
  if (minutes < 1) return 'Az önce çevrimdışı oldu';
  if (minutes < 60) return `${minutes} dakika önce çevrimdışı oldu`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce çevrimdışı oldu`;
  
  const days = Math.floor(hours / 24);
  return `${days} gün önce çevrimdışı oldu`;
});

// Modeli dışa aktarma
module.exports = mongoose.model('User', UserSchema);
