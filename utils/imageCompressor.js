const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

/**
 * Compress an image file
 * @param {string} inputPath - Path to the input image
 * @param {Object} options - Compression options
 * @returns {Promise<Object>} - Compressed image info
 */
const compressImage = async (inputPath, options = {}) => {
  const {
    maxWidth = 2048,
    maxHeight = 2048,
    quality = 85,
    format = null, // null means keep original format
    keepMetadata = false
  } = options;

  try {
    // Get image metadata
    const metadata = await sharp(inputPath).metadata();
    
    // Determine output format
    const outputFormat = format || metadata.format;
    
    // Create a sharp instance
    let sharpInstance = sharp(inputPath);
    
    // Resize if necessary (maintaining aspect ratio)
    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      sharpInstance = sharpInstance.resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }
    
    // Remove metadata if requested
    if (!keepMetadata) {
      sharpInstance = sharpInstance.rotate(); // Auto-rotate based on EXIF
    }
    
    // Apply format-specific compression
    switch (outputFormat) {
      case 'jpeg':
      case 'jpg':
        sharpInstance = sharpInstance.jpeg({
          quality,
          progressive: true,
          mozjpeg: true // Use mozjpeg encoder for better compression
        });
        break;
      case 'png':
        sharpInstance = sharpInstance.png({
          quality,
          compressionLevel: 9,
          progressive: true
        });
        break;
      case 'webp':
        sharpInstance = sharpInstance.webp({
          quality,
          lossless: false,
          nearLossless: false,
          smartSubsample: true,
          reductionEffort: 6
        });
        break;
      default:
        // For other formats, try to compress with general settings
        sharpInstance = sharpInstance.toFormat(outputFormat, { quality });
    }
    
    // Generate output path
    const parsedPath = path.parse(inputPath);
    const outputPath = path.join(
      parsedPath.dir,
      `${parsedPath.name}_compressed${parsedPath.ext}`
    );
    
    // Process and save the image
    const info = await sharpInstance.toFile(outputPath);
    
    // Get file sizes for comparison
    const originalStats = await fs.stat(inputPath);
    const compressedStats = await fs.stat(outputPath);
    
    return {
      success: true,
      originalPath: inputPath,
      compressedPath: outputPath,
      originalSize: originalStats.size,
      compressedSize: compressedStats.size,
      compressionRatio: ((1 - compressedStats.size / originalStats.size) * 100).toFixed(2),
      metadata: {
        width: info.width,
        height: info.height,
        format: info.format
      }
    };
  } catch (error) {
    console.error('Image compression error:', error);
    return {
      success: false,
      error: error.message,
      originalPath: inputPath
    };
  }
};

/**
 * Compress multiple images in parallel
 * @param {Array} imagePaths - Array of image paths
 * @param {Object} options - Compression options
 * @returns {Promise<Array>} - Array of compression results
 */
const compressImages = async (imagePaths, options = {}) => {
  const compressionPromises = imagePaths.map(path => compressImage(path, options));
  return Promise.all(compressionPromises);
};

/**
 * Check if a file is an image based on mimetype
 * @param {string} mimetype - File mimetype
 * @returns {boolean}
 */
const isCompressibleImage = (mimetype) => {
  const compressibleTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/tiff',
    'image/bmp'
  ];
  return compressibleTypes.includes(mimetype?.toLowerCase());
};

/**
 * Get optimal compression settings based on file size and type
 * @param {number} fileSize - File size in bytes
 * @param {string} mimetype - File mimetype
 * @returns {Object} - Compression options
 */
const getOptimalCompressionSettings = (fileSize, mimetype) => {
  const MB = 1024 * 1024;
  
  // For very large files, be more aggressive
  if (fileSize > 10 * MB) {
    return {
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 80
    };
  }
  
  // For medium files
  if (fileSize > 5 * MB) {
    return {
      maxWidth: 2048,
      maxHeight: 2048,
      quality: 85
    };
  }
  
  // For smaller files, preserve more quality
  return {
    maxWidth: 2560,
    maxHeight: 2560,
    quality: 90
  };
};

module.exports = {
  compressImage,
  compressImages,
  isCompressibleImage,
  getOptimalCompressionSettings
};