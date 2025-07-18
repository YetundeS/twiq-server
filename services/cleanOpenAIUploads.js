const fs = require('fs');
const openai = require('../openai');

async function cleanupFiles(openaiFileIds) {
  if (!openaiFileIds || openaiFileIds.length === 0) return;

  // Create cleanup tasks that run independently
  const cleanupTasks = openaiFileIds.map(async (fileInfo) => {
    const results = { local: false, openai: false };

    // Local file cleanup
    if (fileInfo.tempPath && fs.existsSync(fileInfo.tempPath)) {
      try {
        fs.unlinkSync(fileInfo.tempPath);
        results.local = true;
      } catch (error) {
        // skip file cleanup error
      }
    }

    // OpenAI file cleanup with timeout
    try {
      await Promise.race([
        openai.files.delete(fileInfo.id),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout after 10 seconds')), 10000)
        )
      ]);
      results.openai = true;
    } catch (error) {
        // openai file cleanup error
    }

    return results;
  });

  // Wait for all cleanup tasks to complete
  await Promise.allSettled(cleanupTasks);
}

module.exports = cleanupFiles;