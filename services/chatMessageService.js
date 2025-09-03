const openai = require("../openai");
const { countTokens, getEncodingForModel } = require('../utils/tokenEncoder');

async function generateCustomSessionTitle(content) {
  const prompt = `Summarize this user message in 4 words max for a chat title:\n"${content}"`;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 15,
    });

    let title = response.choices?.[0]?.message?.content?.trim() || 'New Chat';

    // remove surrounding quotes if present (single or double)
    title = title.replace(/^["']|["']$/g, '');

    return title;
  } catch (err) {
    return 'New Chat';
  }
}


async function checkIfEnoughQuota(user, inputContent = '', estimatedOutputTokens = 1000, model = 'gpt-4') {
  const quota = user.subscription_quota;
  const usage = user.subscription_usage || {
    input_tokens_used: 0,
    output_tokens_used: 0,
    cached_input_tokens_used: 0,
  };

  const inputTokens = countTokens(inputContent, model);
  const outputTokens = estimatedOutputTokens; // You can refine this based on assistant model

  const estimated = {
    input: inputTokens,
    output: outputTokens,
    cached: 0,
  };

  if (
    usage.input_tokens_used + estimated.input > quota.input_tokens ||
    usage.output_tokens_used + estimated.output > quota.output_tokens ||
    usage.cached_input_tokens_used + estimated.cached > quota.cached_input_tokens
  ) {
    return { error: 'Quota exceeded' };
  }

  return { ok: true };
}

// Helper function to categorize files
const categorizeFiles = (files) => {
  const textFiles = [];
  const imageFiles = [];
  
  // Define allowed types from frontend
  const textMimeTypes = new Set([
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/html'
  ]);
  
  const imageMimeTypes = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/tiff'
  ]);
  
  files.forEach(file => {
    // Use 'mimetype' property (from multer/server-side) or 'type' (from browser)
    const mimeType = (file.mimetype || file.type || '').toLowerCase();
    
    if (imageMimeTypes.has(mimeType)) {
      imageFiles.push(file);
    } else if (textMimeTypes.has(mimeType)) {
      textFiles.push(file);
    } else {
      // Fallback: check file extension for edge cases
      const fileName = (file.originalname || file.name || '').toLowerCase();
      const isTextByExtension = fileName.endsWith('.txt') || 
                               fileName.endsWith('.pdf') || 
                               fileName.endsWith('.docx') || 
                               fileName.endsWith('.md') || 
                               fileName.endsWith('.html');
      
      const isImageByExtension = fileName.endsWith('.jpg') || 
                                fileName.endsWith('.jpeg') || 
                                fileName.endsWith('.png') || 
                                fileName.endsWith('.gif') || 
                                fileName.endsWith('.webp') || 
                                fileName.endsWith('.svg') || 
                                fileName.endsWith('.bmp') || 
                                fileName.endsWith('.tiff');
      
      if (isImageByExtension) {
        imageFiles.push(file);
      } else {
        // Default to text (matches your original logic)
        textFiles.push(file);
      }
    }
  });
  
  return { textFiles, imageFiles };
};

module.exports = { generateCustomSessionTitle, checkIfEnoughQuota, categorizeFiles };