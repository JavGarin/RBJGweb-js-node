import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises'; // Usar fs.promises para async/await
import { fileURLToPath, pathToFileURL } from 'url'; // <--- Importar pathToFileURL
import { removeBackground } from '@imgly/background-removal-node';

// Configuración de paths para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Crear directorio de subidas si no existe
await fs.mkdir(UPLOAD_DIR, { recursive: true });

// Middleware
app.use(cors()); // Habilitar CORS para todas las rutas
app.use(express.json()); // Para parsear application/json
app.use(express.urlencoded({ extended: true })); // Para parsear application/x-www-form-urlencoded

// Servir archivos estáticos desde la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de Multer para almacenamiento temporal
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Usar un nombre de archivo único y decodificar correctamente nombres con caracteres especiales
    cb(null, `${Date.now()}-${Buffer.from(file.originalname, 'latin1').toString('utf8')}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      console.error('Tipo de archivo no soportado:', file.mimetype);
      cb(new Error('Tipo de archivo no soportado. Solo se permiten JPG, PNG y WEBP.'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
}).single('image'); // Espera un campo llamado 'image'

// --- Rutas de la API ---

// Middleware para manejar errores de Multer (ej. archivo muy grande, tipo inválido)
const handleUpload = (req, res, next) => {
    upload(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            // Error de Multer (ej: tamaño de archivo)
            console.error('Multer Error:', err);
            return res.status(400).json({ error: `Error al subir archivo: ${err.message}` });
        } else if (err) {
            // Otro error (ej: filtro de tipo de archivo)
            console.error('File Filter Error:', err);
            return res.status(400).json({ error: err.message });
        }
        // Todo bien, continuar
        next();
    });
};

app.post('/api/remove-background', handleUpload, async (req, res) => {
  let imagePath = null; // Guardar path para limpieza segura
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ninguna imagen.' });
    }
    imagePath = req.file.path; // La ruta original del sistema de archivos

    // Obtener formato deseado del cuerpo de la solicitud
    const requestedFormat = req.body.outputFormat || 'png'; // 'png' por defecto
    let outputMimeType = 'image/png'; // Mime type por defecto

    switch (requestedFormat.toLowerCase()) {
        case 'jpeg':
        case 'jpg':
            outputMimeType = 'image/jpeg';
            break;
        case 'webp':
            outputMimeType = 'image/webp';
            break;
        case 'png':
        default:
            outputMimeType = 'image/png';
            break;
    }

    // ----> INICIO: CORRECCIÓN <----
    // Convertir la ruta del sistema de archivos a una file URL para @imgly
    const imageUrl = pathToFileURL(imagePath).href;
    console.log(`Procesando imagen (como URL): ${imageUrl}, Formato salida: ${outputMimeType}`);
    // ----> FIN: CORRECCIÓN <----

    // Usar @imgly/background-removal-node con la URL convertida
    const outputBlob = await removeBackground(imageUrl, { // <--- USAR imageUrl
      output: {
        format: outputMimeType,
        quality: 0.9 // Ajustar calidad si es necesario
      },
      // progress: (key, current, total) => { // Descomentar si necesitas progreso
      //   console.log(`Downloading ${key}: ${current} of ${total}`);
      // }
    });

    // Convertir Blob a Buffer para enviarlo
    const buffer = await outputBlob.arrayBuffer();
    const imageBuffer = Buffer.from(buffer);

    console.log(`Imagen procesada. Enviando ${imageBuffer.length} bytes como ${outputMimeType}`);

    // Limpiar el archivo temporal subido DESPUÉS de procesar y ANTES de enviar respuesta
    // Usar la RUTA ORIGINAL (imagePath) para la eliminación
    await fs.unlink(imagePath);
    console.log('Archivo temporal eliminado:', imagePath);
    imagePath = null; // Marcar como eliminado para evitar doble eliminación en catch

    // Enviar la imagen procesada como respuesta
    res.set('Content-Type', outputMimeType);
    res.send(imageBuffer);

  } catch (error) {
    console.error('Error detallado al procesar la imagen:', error);
    // Asegurarse de limpiar el archivo subido incluso si hay un error, solo si no se eliminó ya
    if (imagePath) {
      try {
        await fs.unlink(imagePath);
        console.log('Archivo temporal eliminado después de error:', imagePath);
      } catch (unlinkError) {
        // Loguear si falla la eliminación en el catch, pero no detener el flujo de error principal
        console.error('Error al intentar eliminar archivo temporal después de error:', unlinkError);
      }
    }
    // Enviar respuesta de error genérica al cliente
    res.status(500).json({
      error: 'Error interno del servidor al procesar la imagen.',
      // Puedes opcionalmente enviar más detalles en desarrollo, pero ten cuidado en producción
      // details: process.env.NODE_ENV === 'development' ? error.message : undefined
      details: error.message || 'Error desconocido' // O enviar siempre el mensaje si lo prefieres
    });
  }
});

// --- Ruta para el Frontend ---
// Esta ruta debe ir DESPUÉS de las rutas de la API
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Inicio del Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Error: El puerto ${PORT} ya está en uso. Intenta con otro puerto.`);
  } else {
    console.error('Error al iniciar el servidor:', err);
  }
  process.exit(1); // Salir si no se puede iniciar el servidor
});