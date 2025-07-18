
const fs = require('fs');
const openai = require('../openai');

async function cleanupFiles(openaiFileIds) {
  if (openaiFileIds.length === 0) return;

  // Create cleanup tasks that run independently
  const cleanupTasks = openaiFileIds.map(async (fileInfo) => {
    // Local file cleanup
    if (fileInfo.tempPath && fs.existsSync(fileInfo.tempPath)) {
      try {
        fs.unlinkSync(fileInfo.tempPath);
        console.log(`✅ Local file cleaned: ${fileInfo.tempPath}`);
      } catch (error) {
        console.warn(`❌ Local file cleanup failed: ${fileInfo.tempPath}`, error.message);
      }
    }

    // OpenAI file cleanup with timeout
    try {
      await Promise.race([
        openai.files.del(fileInfo.id),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 10000)
        )
      ]);
      console.log(`✅ OpenAI file cleaned: ${fileInfo.name} (${fileInfo.id})`);
    } catch (error) {
      console.warn(`❌ OpenAI file cleanup failed: ${fileInfo.name}`, error.message);
      // Don't throw - just log and continue
    }
  });

  // Wait for all cleanup tasks to complete (or fail)
  await Promise.allSettled(cleanupTasks);
}


module.exports = cleanupFiles;