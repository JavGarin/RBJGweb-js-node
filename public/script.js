document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos del DOM ---
    const uploadArea = document.getElementById('uploadArea');
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const selectBtn = document.getElementById('selectBtn');

    const previewArea = document.getElementById('previewArea');
    const previewImage = document.getElementById('previewImage');
    // const resultImage = document.getElementById('resultImage'); // Opcional si quieres mostrar ambas
    const imageInfo = document.getElementById('imageInfo');
    const formatSelect = document.getElementById('formatSelect');
    const removeBgBtn = document.getElementById('removeBgBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const resetBtn = document.getElementById('resetBtn');

    const loading = document.getElementById('loading');
    const successMessage = document.getElementById('successMessage');
    const successCloseBtn = document.getElementById('successCloseBtn');
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    const errorCloseBtn = document.getElementById('errorCloseBtn');

    // --- Estado ---
    let originalFile = null;
    let processedBlob = null; // Almacenará el resultado como Blob
    let processedBlobUrl = null; // URL para la imagen procesada

    // --- Funciones ---

    // Mostrar/Ocultar Elementos
    const showElement = (el) => { el.style.display = 'flex'; }; // Usar flex para mensajes
    const hideElement = (el) => { el.style.display = 'none'; };

    // Mostrar Mensajes
    const showLoading = () => { hideMessages(); showElement(loading); disableButtons(); };
    const hideLoading = () => hideElement(loading);
    const showSuccess = () => { hideMessages(); showElement(successMessage); };
    const showError = (message) => {
        hideMessages();
        errorText.textContent = message || 'Ocurrió un error inesperado.';
        showElement(errorMessage);
        enableButtons(); // Habilitar botones para que pueda intentar de nuevo o resetear
    };
    const hideMessages = () => {
        hideElement(successMessage);
        hideElement(errorMessage);
        hideElement(loading); // También ocultar carga por si acaso
    };

    // Habilitar/Deshabilitar Botones
    const disableButtons = () => {
        removeBgBtn.disabled = true;
        downloadBtn.disabled = true;
        resetBtn.disabled = true; // Deshabilitar mientras procesa
        formatSelect.disabled = true;
    };
    const enableButtons = (processed = false) => {
        removeBgBtn.disabled = false;
        downloadBtn.disabled = !processed; // Solo habilitar si hay resultado
        resetBtn.disabled = false;
        formatSelect.disabled = false;
    };

    // Limpiar Estado y UI
    const resetApp = () => {
        originalFile = null;
        if (processedBlobUrl) {
            URL.revokeObjectURL(processedBlobUrl); // Liberar memoria
        }
        processedBlob = null;
        processedBlobUrl = null;

        fileInput.value = ''; // Resetear input de archivo
        previewImage.src = '#'; // Limpiar preview
        imageInfo.textContent = '';
        hideElement(previewArea);
        hideMessages();
        showElement(uploadArea);
        enableButtons(false); // Deshabilitar descarga
    };

    // Manejar Selección de Archivo
    const handleFileSelect = (file) => {
        if (!file) return;

        // Validación básica (tipo y tamaño)
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const maxSize = 5 * 1024 * 1024; // 5MB

        if (!allowedTypes.includes(file.type)) {
            showError(`Formato no soportado (${file.type}). Usa JPG, PNG o WEBP.`);
            resetApp();
            return;
        }
        if (file.size > maxSize) {
            showError(`Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo 5MB.`);
            resetApp();
            return;
        }

        originalFile = file;
        hideMessages();
        hideElement(uploadArea);
        showElement(previewArea);

        // Mostrar preview de la imagen original
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            imageInfo.textContent = `Original: ${originalFile.name} (${(originalFile.size / 1024).toFixed(1)} KB)`;
        };
        reader.readAsDataURL(originalFile);

        enableButtons(false); // Habilitar "Quitar fondo", deshabilitar "Descargar"
    };

    // Procesar Imagen (Llamada a la API)
    const processImage = async () => {
        if (!originalFile) return;

        showLoading();

        const formData = new FormData();
        formData.append('image', originalFile);
        formData.append('outputFormat', formatSelect.value); // Enviar formato seleccionado

        try {
            const response = await fetch('/api/remove-background', {
                method: 'POST',
                body: formData,
                // No es necesario 'Content-Type': 'multipart/form-data', el navegador lo hace por FormData
            });

            if (!response.ok) {
                // Intentar leer el error del JSON si el servidor lo envió así
                let errorMsg = `Error del servidor: ${response.status} ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    if (errorData && errorData.error) {
                        errorMsg = errorData.error;
                    } else if (response.headers.get("content-type")?.includes("text")) {
                        // Si es texto plano, leerlo
                         errorMsg = await response.text();
                    }
                } catch (e) {
                    // Si no se pudo parsear el JSON, usar el statusText
                     console.warn("No se pudo parsear respuesta de error como JSON");
                     // Leer como texto si es posible
                     if (response.headers.get("content-type")?.includes("text")) {
                        errorMsg = await response.text();
                     }
                }
                 throw new Error(errorMsg);
            }

            // Obtener resultado como Blob
            processedBlob = await response.blob();

            // Crear URL para mostrar la imagen procesada
            if (processedBlobUrl) {
                URL.revokeObjectURL(processedBlobUrl); // Liberar la URL anterior si existe
            }
            processedBlobUrl = URL.createObjectURL(processedBlob);

            // Mostrar la imagen procesada (reemplazando la original o en otro img)
            previewImage.src = processedBlobUrl; // Actualiza la imagen de preview
            imageInfo.textContent += ` | Procesada (${(processedBlob.size / 1024).toFixed(1)} KB)`;

            hideLoading();
            showSuccess();
            enableButtons(true); // Habilitar descarga

        } catch (error) {
            console.error('Error al procesar imagen:', error);
            hideLoading();
            showError(error.message || 'Error de conexión o al procesar la imagen.');
            enableButtons(false); // Habilitar botones principales, no descarga
        }
    };

    // Descargar Imagen Procesada
    const downloadImage = () => {
        if (!processedBlobUrl || !processedBlob) return;

        const link = document.createElement('a');
        link.href = processedBlobUrl;

        // Crear nombre de archivo
        const originalName = originalFile.name.split('.').slice(0, -1).join('.');
        const extension = formatSelect.value === 'jpeg' ? 'jpg' : formatSelect.value; // Usar jpg para jpeg
        link.download = `${originalName}_no_bg.${extension}`;

        document.body.appendChild(link); // Necesario para Firefox
        link.click();
        document.body.removeChild(link);
    };


    // --- Event Listeners ---

    // Clic en botón "Seleccionar archivo"
    selectBtn.addEventListener('click', () => fileInput.click());

    // Selección de archivo a través del input
    fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));

    // Arrastrar y Soltar (Drag and Drop)
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault(); // Necesario para permitir 'drop'
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });
    // Click en el drop zone también abre el selector de archivos
    dropZone.addEventListener('click', (e) => {
         // Evitar que el click en el botón dentro del dropzone lo active dos veces
         if (e.target !== selectBtn && !selectBtn.contains(e.target)) {
              fileInput.click();
         }
    });


    // Clic en "Quitar fondo"
    removeBgBtn.addEventListener('click', processImage);

    // Clic en "Descargar"
    downloadBtn.addEventListener('click', downloadImage);

    // Clic en "Nueva imagen" (Reset)
    resetBtn.addEventListener('click', resetApp);

    // Cerrar mensajes
    successCloseBtn.addEventListener('click', hideMessages);
    errorCloseBtn.addEventListener('click', hideMessages);

    // --- Inicialización ---
    resetApp(); // Asegurarse de que la app inicie en estado limpio

});

// // importamos las librerias necesarias.
// import {removeBackground} from '@imgly/background-removal-node'; // biblioteca importada.
// import fs from 'fs'; // modulo fs que nos permite leer archivos.
// import path from 'path'; // modulo path que nos permite leer la ruta de un archivo.

// // se definen las rutas de los archivos de entrada y salida.
// const inputPath = "./logogijam.png";
// const outputPath = "./output-logoremove.png";

// // se valida si el archivo de entrada existe.
// if (!fs.existsSync(inputPath)) {
//     console.error(`Imput file not found ${inputPath}`);
//     process.exit(1);
// };

// // se crea una variable que contendra la ruta absoluta de la imagen.
// const absolutePath = path.resolve(inputPath); // el modulo path nos permite obtener la ruta absoluta de un archivo o convertir la ruta relativa a absoluta.
// const imageUrl = `file://${absolutePath}` // se crea una variable que contendra la ruta absoluta de la imagen.

// // se crea una funcion asincrona que convierte un blob a un buffer.
// async function blobToBuffer(blob) {
//     const arrayBuffer = await blob.arrayBuffer()
//     return Buffer.from(arrayBuffer)
// };

// // se remueve el fondo de la imagen y se guarda en la ruta especificada.
// removeBackground(imageUrl)
//     .then(async blob => {
//         console.log("Background removed successfully");
//         const buffer = await blobToBuffer(blob)
//         fs.writeFileSync(outputPath, buffer); // se escribe el archivo en la ruta especificada.
//     })
//     .catch(error => {
//         console.error(error);
//     });