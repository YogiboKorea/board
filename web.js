require('dotenv').config();
const express = require('express');
const multer = require('multer');
const ftp = require('ftp');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let db;

// MongoDB 연결
MongoClient.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(client => {
        db = client.db('yogibo'); // 'yogibo' 데이터베이스에 연결
        console.log('MongoDB에 연결되었습니다.');

        // 서버 시작
        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });
    })
    .catch(err => {
        console.error('MongoDB 연결 오류:', err);
    });

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

const ftpServer = process.env.FTP_SERVER;
const ftpUsername = process.env.FTP_USERNAME;
const ftpPassword = process.env.FTP_PASSWORD;

app.post('/upload', upload.single('file'), (req, res) => {
    const { text } = req.body;
    console.log('File received:', req.file);
    console.log('Text received:', text);

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
                    console.error('FTP 업로드 실패:', err);
                    return res.status(500).json({ error: 'FTP 업로드 실패' });
                }

                console.log(`파일 업로드 완료: ${remoteFilePath}`);
                client.end();
                fs.unlink(localFilePath, (err) => {
                    if (err) {
                        console.error('파일 삭제 실패:', err);
                        return res.status(500).json({ error: '파일 삭제 실패' });
                    }

                    const fileMetaData = {
                        filename: req.file.filename,
                        originalname: req.file.originalname,
                        mimetype: req.file.mimetype,
                        size: req.file.size,
                        remoteFilePath: remoteFilePath,
                        text: text,
                        uploadDate: new Date()
                    };

                    db.collection('replay').insertOne(fileMetaData, (err, result) => {
                        if (err) {
                            console.error('MongoDB 저장 실패:', err);
                            return res.status(500).json({ error: 'MongoDB 저장 실패' });
                        }
                        res.status(200).json({ message: '파일 업로드 및 데이터베이스 저장 성공', file: fileMetaData });
                    });
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

// 댓글 데이터 가져오기
app.get('/replay', (req, res) => {
    db.collection('replay').find({}, { projection: { text: 1, remoteFilePath: 1, _id: 0 } }).sort({ uploadDate: 1 }).toArray((err, reviews) => {
        if (err) {
            console.error('MongoDB 조회 실패:', err);
            return res.status(500).json({ error: 'MongoDB 조회 실패' });
        }
        res.status(200).json(reviews);
    });
});
