const express = require('express');
const router = express.Router();
const farmerController = require('../controllers/farmerController');
const { verifyToken, checkRole } = require('../middleware/authMiddleware');

// GET /api/farmer/stats - Get dashboard stats
router.get('/stats', verifyToken, checkRole('FARMER'), farmerController.getFarmerStats);

// PUT /api/farmer/profile - Update profile
router.put('/profile', verifyToken, farmerController.updateProfile);

module.exports = router;
