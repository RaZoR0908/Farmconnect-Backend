const cloudinary = require('../config/cloudinary');

// Upload single image
exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    // Upload to Cloudinary from buffer
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'farmconnect/products',
          transformation: [
            { width: 800, height: 800, crop: 'limit' },
            { quality: 'auto' }
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        url: result.secure_url,
        public_id: result.public_id
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error uploading image',
      error: error.message
    });
  }
};

// Upload multiple images
exports.uploadMultipleImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No image files provided'
      });
    }

    // Limit to 5 images
    const files = req.files.slice(0, 5);

    // Upload all images to Cloudinary
    const uploadPromises = files.map((file, index) => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'farmconnect/products',
            transformation: [
              { width: 800, height: 800, crop: 'limit' },
              { quality: 'auto' }
            ]
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve({
                url: result.secure_url,
                public_id: result.public_id
              });
            }
          }
        );
        uploadStream.end(file.buffer);
      });
    });

    const results = await Promise.all(uploadPromises);

    res.json({
      success: true,
      message: `${results.length} images uploaded successfully`,
      data: {
        images: results,
        urls: results.map(r => r.url)
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error uploading images',
      error: error.message
    });
  }
};

// Delete image from Cloudinary
exports.deleteImage = async (req, res) => {
  try {
    const { public_id } = req.body;

    if (!public_id) {
      return res.status(400).json({
        success: false,
        message: 'public_id is required'
      });
    }

    await cloudinary.uploader.destroy(public_id);

    res.json({
      success: true,
      message: 'Image deleted successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting image',
      error: error.message
    });
  }
};
