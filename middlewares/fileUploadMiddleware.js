import fs from "fs";
import multer from "multer";
import path from "path";

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'temp', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const chatFileUpload = multer({
    storage: multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, uploadsDir); // Store in temp/uploads folder
        },
        filename: function (req, file, cb) {
            // Generate unique filename to avoid conflicts
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const fileExtension = path.extname(file.originalname);
            const baseName = path.basename(file.originalname, fileExtension);
            cb(null, `${baseName}-${uniqueSuffix}${fileExtension}`);
        }
    }),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit per file (OpenAI's limit)
        files: 10, // Maximum 10 files
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'text/plain',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv',
            'application/json',
            'application/msword', // .doc files
            'application/vnd.ms-excel', // .xls files
            'text/markdown',
            'application/rtf'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${file.mimetype}`));
        }
    }
});

export default chatFileUpload;