import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import { removeBackground } from '@imgly/background-removal-node';
import { PassThrough } from 'stream';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = '/tmp/uploads';

(async () => {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    console.log(`Directorio de subidas creado o ya existe: ${UPLOAD_DIR}`);
  } catch (error) {
    console.error('Error al crear el directorio de subidas:', error);
  }
})();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, `${Date.now()}-${originalname}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no soportado. Solo JPG, PNG y WEBP.'), false);
    }
  },
  limits: { fileSize: 3 * 1024 * 1024 } // 3MB máximo
}).single('image');

const handleUpload = (req, res, next) => {
  upload(req, res, err => {
    if (err instanceof multer.MulterError || err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
};

app.post('/api/remove-background', handleUpload, async (req, res) => {
  let imagePath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ninguna imagen para procesar.' });
    }

    imagePath = req.file.path;

    const allowedFormats = ['png', 'jpeg', 'jpg', 'webp'];
    const requestedFormat = allowedFormats.includes(req.body.outputFormat?.toLowerCase())
      ? req.body.outputFormat.toLowerCase()
      : 'png';

    let outputMimeType = 'image/png';
    switch (requestedFormat) {
      case 'jpeg':
      case 'jpg':
        outputMimeType = 'image/jpeg';
        break;
      case 'webp':
        outputMimeType = 'image/webp';
        break;
    }

    const imageUrl = pathToFileURL(imagePath).href;
    const blob = await removeBackground(imageUrl, {
      output: {
        format: outputMimeType,
        quality: outputMimeType === 'image/jpeg' ? 0.6 : 0.8
      }
    });

    const stream = blob.stream();
    const passThrough = new PassThrough();

    res.set('Content-Type', outputMimeType);

    passThrough.on('end', () => {
      console.log('Imagen procesada enviada correctamente.');
    });

    passThrough.on('error', err => {
      console.error('Error al enviar la imagen:', err);
      res.status(500).json({ error: 'Error al procesar la imagen.' });
    });

    stream.pipe(passThrough).pipe(res);
  } catch (error) {
    console.error('Error durante el procesamiento:', error);
    res.status(500).json({ error: 'Error interno del servidor al procesar la imagen.' });
  } finally {
    if (imagePath) {
      try {
        await fs.unlink(imagePath);
        console.log('Archivo temporal eliminado:', imagePath);
      } catch (e) {
        console.error('Error al eliminar archivo temporal:', e);
      }
    }
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Puerto ${PORT} ya en uso.`);
  } else {
    console.error('Error al iniciar el servidor:', err);
  }
  process.exit(1);
});
