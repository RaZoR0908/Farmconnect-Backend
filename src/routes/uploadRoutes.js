const express = require('express');
const router = express.Router();
const multer = require('multer');
const uploadController = require('../controllers/uploadController');
const { verifyToken } = require('../middleware/authMiddleware');

// Configure multer for memory storage (files stored in memory as Buffer)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per file
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  },
});

// POST /api/upload/image - Upload single image
router.post('/image', verifyToken, upload.single('image'), uploadController.uploadImage);

// POST /api/upload/images - Upload multiple images (max 5)
router.post('/images', verifyToken, upload.array('images', 5), uploadController.uploadMultipleImages);

// DELETE /api/upload/image - Delete image from Cloudinary
router.delete('/image', verifyToken, uploadController.deleteImage);

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum 5MB per image.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum 5 images allowed.'
      });
    }
  }
  res.status(400).json({
    success: false,
    message: error.message || 'Error uploading file'
  });
});

module.exports = router;
