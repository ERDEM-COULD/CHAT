const express = require('express');
const router = express.Router();
const speakeasy = require('speakeasy');
const User = require('../models/User');

// 2FA ayarlarını oluştur
router.post('/setup-2fa', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const secret = speakeasy.generateSecret({ length: 20 });
    
    user.twoFactorSecret = secret.base32;
    await user.save();
    
    res.json({
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2FA doğrulama
router.post('/verify-2fa', async (req, res) => {
  try {
    const { token } = req.body;
    const user = await User.findById(req.user.id);
    
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token
    });
    
    if (verified) {
      user.twoFactorEnabled = true;
      await user.save();
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Invalid token' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// IP kontrol middleware'i
const ipControl = async (req, res, next) => {
  const ip = req.ip;
  const user = await User.findById(req.user.id);
  
  // Şüpheli IP kontrolü
  if (user.suspiciousIPs.includes(ip)) {
    return res.status(403).json({ error: 'Suspicious activity detected' });
  }
  
  // Yeni IP kaydet
  if (!user.knownIPs.includes(ip)) {
    user.knownIPs.push(ip);
    await user.save();
    
    // E-posta bildirimi gönder
    sendSecurityAlertEmail(user.email, ip);
  }
  
  next();
};

module.exports = router;
