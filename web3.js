const express = require('express');
const multer = require('multer');
const ftp = require('ftp');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 8010;

app.use(cors());

// 업로드 디렉토리 확인 및 생성
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const generateUniqueFilename = (originalname) => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    const ext = path.extname(originalname);
    return `${timestamp}-${random}${ext}`;
};

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueFilename = generateUniqueFilename(file.originalname);
        cb(null, uniqueFilename);
    }
});

const upload = multer({ storage: storage });

// FTP 서버 설정
const ftpServer = '계정';
const ftpUsername = '아이디';
const ftpPassword = '비번';

app.post('/upload', upload.single('file'), (req, res) => {
    console.log('File received:', req.file);

    if (!req.file) {
        console.error('No file uploaded');
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const localFilePath = req.file.path;
    const remoteFilePath = `/web/board/new/${req.file.filename}`;

    const client = new ftp();

    client.on('ready', () => {
        console.log('FTP 연결');
        fs.readFile(localFilePath, (err, data) => {
            if (err) {
                console.error('파일 로드 실패:', err);
                return res.status(500).json({ error: '파일 로드 실패' });
            }

            client.put(data, remoteFilePath, (err) => {
                if (err) {
                    console.error('FTP 연결 실패:', err);
                    return res.status(500).json({ error: 'FTP 연결 실패' });
                }

                console.log(`파일 업로드 ${remoteFilePath}`);
                client.end();
                fs.unlink(localFilePath, (err) => {
                    if (err) {
                        console.error('파일 로드 실패:', err);
                        return res.status(500).json({ error: '파일 로드 실패' });
                    }

                    res.status(200).json({ message: '데이터 전송성공' });
                });
            });
        });
    });
    
    client.on('error', (err) => {
        console.error('FTP client error:', err);
        res.status(500).json({ error: 'FTP client error', details: err.message });
    });

    client.on('greeting', (msg) => {
        console.log('FTP server greeting:', msg);
    });

    client.on('close', (hadError) => {
        console.log('FTP connection closed', hadError ? 'due to an error' : 'normally');
    });

    client.on('end', () => {
        console.log('FTP connection ended');
    });

    console.log('Connecting to FTP server');
    client.connect({
        host: ftpServer,
        user: ftpUsername,
        password: ftpPassword
    });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
