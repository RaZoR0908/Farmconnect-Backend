const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// POST /api/auth/register - Register new user
router.post('/register', authController.register);

// POST /api/auth/login - Login user
router.post('/login', authController.login);

// GET /api/auth/profile/:userId - Get user profile
router.get('/profile/:userId', authController.getProfile);

// GET /api/auth/debug/users - List all users (DEBUG ONLY - Remove in production)
router.get('/debug/users', async (req, res) => {
  const supabase = require('../config/db');
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, phone, full_name, role')
      .limit(20);
    
    if (error) throw error;
    
    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
