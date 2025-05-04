import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises'; // Usar fs.promises para async/await
// Importar fileURLToPath y pathToFileURL para trabajar con rutas en ES Modules
import { fileURLToPath, pathToFileURL } from 'url';
import { removeBackground } from '@imgly/background-removal-node';

// Configuración de paths para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000; // Usar puerto de entorno para el deploy
const UPLOAD_DIR = '/tmp/uploads'; // Directorio para archivos temporales

// Crear directorio de subidas si no existe al iniciar el servidor
// Usamos un IIFE (Immediately Invoked Function Expression) async para esto
(async () => {
    try {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        console.log(`Directorio de subidas creado o ya existe: ${UPLOAD_DIR}`);
    } catch (error) {
        console.error('Error al crear el directorio de subidas:', error);
        // Considerar si el servidor debe fallar si no puede crear el directorio
        // process.exit(1);
    }
})();


// Middleware
// cors() habilitará CORS para TODAS las rutas. En producción, quizás quieras configurarlo más estrictamente.
app.use(cors());
app.use(express.json()); // Para parsear application/json bodies
app.use(express.urlencoded({ extended: true })); // Para parsear application/x-www-form-urlencoded bodies

// Servir archivos estáticos desde la carpeta 'public'
// Esto hará que index.html, style.css, script.js, etc., sean accesibles directamente
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de Multer para almacenamiento temporal
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR); // Guardar en el directorio temporal
    },
    filename: (req, file, cb) => {
        // Usar un nombre de archivo único basado en timestamp y el nombre original
        // Decodificar el nombre original para evitar problemas con caracteres especiales
        const originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, `${Date.now()}-${originalname}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true); // Aceptar el archivo
        } else {
            console.error('Tipo de archivo no soportado:', file.mimetype);
            // Rechazar el archivo y devolver un error
            cb(new Error('Tipo de archivo no soportado. Solo se permiten JPG, PNG y WEBP.'), false);
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // Límite de 5MB
    }
}).single('image'); // Espera un campo llamado 'image' en el formulario multipart/form-data


// Middleware para manejar errores específicos de Multer (ej. archivo muy grande, tipo inválido)
const handleUpload = (req, res, next) => {
    upload(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            // Error de Multer (ej: FILE_SIZE_LIMIT, etc.)
            console.error('Multer Error:', err.message);
            return res.status(400).json({ error: `Error al subir archivo: ${err.message}` });
        } else if (err) {
            // Otro error (ej: de fileFilter)
             console.error('Upload Error:', err.message);
            return res.status(400).json({ error: err.message });
        }
        // Si no hay errores de Multer, continuar con la siguiente función middleware/ruta
        next();
    });
};


// --- Rutas de la API ---

// Ruta para quitar el fondo de la imagen
app.post('/api/remove-background', upload.single('image'), async (req, res) => {
    let imagePath = null; // Variable para almacenar la ruta del archivo temporal
    try {
        // handleUpload ya verificó si hay archivo y errores de multer/filefilter
        if (!req.file) {
             // Esto no debería pasar si handleUpload funciona correctamente, pero es una buena doble verificación
            return res.status(400).json({ error: 'No se proporcionó ninguna imagen para procesar.' });
        }

        imagePath = req.file.path; // La ruta del archivo temporal subido

        // Obtener formato deseado del cuerpo de la solicitud
        // Asegurarse de que sea una cadena válida y usar un valor por defecto
        const requestedFormat = req.body.outputFormat?.toLowerCase() || 'png';
        let outputMimeType = 'image/png'; // Mime type por defecto

        switch (requestedFormat) {
            case 'jpeg':
            case 'jpg':
                outputMimeType = 'image/jpeg';
                break;
            case 'webp':
                outputMimeType = 'image/webp';
                break;
            case 'png':
            default: // png es el formato más adecuado para imágenes con transparencia
                outputMimeType = 'image/png';
                break;
        }

        // ----> CORRECCIÓN CLAVE <----
        // Convertir la ruta del sistema de archivos a una URL (file://...)
        // @imgly/background-removal-node necesita una URL como entrada en Node.js
        const imageUrl = pathToFileURL(imagePath).href;
        console.log(`Procesando imagen (como URL): ${imageUrl}, Formato salida: ${outputMimeType}`);

        // Usar @imgly/background-removal-node con la URL convertida
        const outputBlob = await removeBackground(imageUrl, {
            output: {
                format: outputMimeType,
                quality: (outputMimeType === 'image/jpeg' ? 0.9 : 1.0) // Ajustar calidad para JPEG
            },
            // Puedes agregar otras opciones de la librería aquí si las necesitas
        });

        // Convertir el Blob de salida a un Buffer para enviarlo en la respuesta HTTP
        const buffer = await outputBlob.arrayBuffer();
        const imageBuffer = Buffer.from(buffer);

        console.log(`Imagen procesada. Enviando ${imageBuffer.length} bytes como ${outputMimeType}`);

        // Limpiar el archivo temporal subido DESPUÉS de procesar exitosamente
        // Usar la RUTA ORIGINAL (imagePath) para la eliminación
        await fs.unlink(imagePath);
        console.log('Archivo temporal eliminado:', imagePath);
        imagePath = null; // Marcar como eliminado para evitar intentarlo de nuevo en el catch

        // Enviar la imagen procesada como respuesta
        res.set('Content-Type', outputMimeType); // Establecer el Content-Type correcto
        res.send(imageBuffer); // Enviar el buffer como cuerpo de la respuesta

    } catch (error) {
        console.error('Error detallado al procesar la imagen:', error);
        // Asegurarse de limpiar el archivo subido incluso si hay un error, solo si no se eliminó ya
        if (imagePath) {
            try {
                await fs.unlink(imagePath);
                console.log('Archivo temporal eliminado después de error:', imagePath);
            } catch (unlinkError) {
                // Loguear si falla la eliminación en el catch
                console.error('Error al intentar eliminar archivo temporal después de error:', unlinkError);
            }
        }
        // Enviar respuesta de error al cliente. Evitar exponer detalles internos en producción.
        res.status(500).json({
            error: 'Error interno del servidor al procesar la imagen.',
            // Incluir detalles solo en desarrollo para debug
            details: process.env.NODE_ENV !== 'production' ? error.message : undefined
        });
    }
});

// --- Ruta para el Frontend (Single Page Application) ---
// Esta ruta debe ir DESPUÉS de todas las rutas de la API
// Captura todas las demás rutas y sirve el index.html
app.get('*', (req, res) => {
    // Asegurarse de que la ruta al index.html es correcta dentro de la carpeta 'public'
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Inicio del Servidor ---
const server = app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log('Presiona CTRL+C para detenerlo');
});

// Manejar errores al iniciar el servidor, como puerto ya en uso
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Error: El puerto ${PORT} ya está en uso. Intenta detener otros procesos o usar otro puerto.`);
    } else {
        console.error('Error al iniciar el servidor:', err);
    }
    process.exit(1); // Salir si no se puede iniciar el servidor
});