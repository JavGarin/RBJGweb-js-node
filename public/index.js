document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos del DOM ---
    // Corregido el nombre de la variable para coincidir con el ID en HTML
    const uploadBox = document.getElementById('upload-box'); // Cambiado de uploadArea a uploadBox
    // Corregido el nombre de la variable para coincidir con la clase/ID en HTML/CSS
    const dropArea = document.getElementById('dropArea'); // Cambiado de dropZone a dropArea
    const fileInput = document.getElementById('fileInput');
    const selectBtn = document.getElementById('selectBtn');

    const previewArea = document.getElementById('previewArea');
    const previewImage = document.getElementById('previewImage');
    // Agregada la query para el nuevo párrafo imageInfo
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

    // --- Elementos del Canvas de Nieve ---
    const snowCanvas = document.getElementById("snow-canvas");
    const ctx = snowCanvas?.getContext("2d"); // Usar optional chaining por seguridad

    // --- Estado ---
    let originalFile = null;
    let processedBlob = null;
    let processedBlobUrl = null;

    // --- Utilidades de UI ---
    // Usar add/remove la clase .hidden en lugar de style.display
    const showElement = el => el?.classList.remove('hidden'); // Usar optional chaining
    const hideElement = el => el?.classList.add('hidden');   // Usar optional chaining

    // Añadir efecto ripple a los botones
document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      const rect = this.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const ripple = document.createElement('span');
      ripple.classList.add('ripple');
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      
      this.appendChild(ripple);
      
      setTimeout(() => {
        ripple.remove();
      }, 600);
    });
  });

    const hideMessages = () => {
        hideElement(successMessage);
        hideElement(errorMessage);
        hideElement(loading); // También ocultar el loading al ocultar mensajes
    };

    const showLoading = () => {
        hideMessages();
        showElement(loading);
        disableButtons();
    };

    const showSuccess = () => {
        hideMessages();
        showElement(successMessage);
    };

    const showError = (message = 'Ocurrió un error inesperado.') => {
        hideMessages();
        if (errorText) errorText.textContent = message; // Verificar si errorText existe
        showElement(errorMessage);
        enableButtons(false); // Deshabilitar descargar si hay error
    };

    const disableButtons = () => {
        [removeBgBtn, downloadBtn, resetBtn, formatSelect].forEach(el => {
            if (el) el.disabled = true; // Verificar si el elemento existe
        });
    };

    const enableButtons = (hasProcessed = false) => {
        // Solo habilitar si los elementos existen
        if (removeBgBtn) removeBgBtn.disabled = false;
        if (downloadBtn) downloadBtn.disabled = !hasProcessed;
        if (resetBtn) resetBtn.disabled = false;
        if (formatSelect) formatSelect.disabled = false;
    };

    const resetApp = () => {
        originalFile = null;
        if (processedBlobUrl) {
            URL.revokeObjectURL(processedBlobUrl); // Liberar memoria
        }
        processedBlob = null;
        processedBlobUrl = null;

        if (fileInput) fileInput.value = ''; // Limpiar el input de archivo
        if (previewImage) previewImage.removeAttribute('src'); // Quitar la imagen de vista previa
        if (imageInfo) imageInfo.textContent = ''; // Limpiar la información del archivo

        hideMessages(); // Ocultar cualquier mensaje o loading
        hideElement(previewArea); // Ocultar el área de vista previa
        showElement(uploadBox); // Mostrar el área de carga (corregido uploadArea a uploadBox)

        disableButtons(); // Deshabilitar botones al inicio

        // Reiniciar la animación de nieve (si existe el canvas)
        if (snowCanvas) {
             resizeCanvas(); // Re-inicializa y dibuja los copos
        }
    };

    const handleFileSelect = (file) => {
        if (!file) return;

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const maxSize = 5 * 1024 * 1024; // 5 MB

        if (!allowedTypes.includes(file.type)) {
            showError(`Formato no soportado (${file.type}). Usa JPG, PNG o WEBP.`);
            resetApp(); // Resetear la app si hay un error de formato
            return;
        }

        if (file.size > maxSize) {
            showError(`Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo 5MB.`);
            resetApp(); // Resetear la app si hay un error de tamaño
            return;
        }

        originalFile = file;

        const reader = new FileReader();
        reader.onload = e => {
            if (previewImage) {
                 previewImage.src = e.target.result;
                 // No necesitas una clase 'loaded' si la opacidad es 1 por defecto en CSS
            }
            if (imageInfo) {
                imageInfo.textContent = `Original: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            }
        };
        reader.onerror = () => {
            showError('Error al leer el archivo.');
            resetApp(); // Resetear si falla la lectura
        };
        reader.readAsDataURL(file);

        hideMessages(); // Ocultar mensajes antes de mostrar la vista previa
        hideElement(uploadBox); // Ocultar el área de carga (corregido)
        showElement(previewArea); // Mostrar el área de vista previa

        enableButtons(false); // Habilitar quitar fondo y reset, deshabilitar descargar
    };

    const processImage = async () => {
        if (!originalFile) {
            showError('No hay imagen seleccionada para procesar.');
            return;
        }

        showLoading();

        const formData = new FormData();
        formData.append('image', originalFile);
        // Asegurarse de enviar el formato seleccionado
        if (formatSelect) {
            formData.append('outputFormat', formatSelect.value);
        } else {
             formData.append('outputFormat', 'png'); // Valor por defecto si no hay select
        }


        try {
            // Usar la ruta relativa a tu servidor local o al path de tu API en el deploy
            const response = await fetch('/api/remove-background', {
                method: 'POST',
                body: formData,
                // headers: { 'Content-Type': '...' } - No es necesario con FormData, el navegador lo pone
            });

            if (!response.ok) {
                const contentType = response.headers.get("content-type") || "";
                let errorMsg = `Error del servidor: ${response.status}`;

                if (contentType.includes("application/json")) {
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorData.details || errorMsg; // Capturar error o details del backend
                } else if (contentType.includes("text")) {
                    errorMsg = await response.text();
                }

                // Lanzar un error con el mensaje obtenido del backend
                throw new Error(errorMsg);
            }

            processedBlob = await response.blob();

            // Liberar el URL anterior antes de crear uno nuevo
            if (processedBlobUrl) {
                 URL.revokeObjectURL(processedBlobUrl);
            }
            processedBlobUrl = URL.createObjectURL(processedBlob);

            if (previewImage) {
                 previewImage.src = processedBlobUrl; // Mostrar la imagen procesada
            }
            if (imageInfo) {
                 imageInfo.textContent += ` | Procesada (${(processedBlob.size / 1024).toFixed(1)} KB, ${processedBlob.type})`; // Añadir info del resultado
            }

            showSuccess();
            enableButtons(true); // Habilitar descarga

        } catch (error) {
            console.error('Error al procesar imagen:', error);
            showError(error.message || 'Error desconocido al procesar la imagen.'); // Mostrar mensaje de error al usuario
            // No resetApp() aquí, para que el usuario vea la imagen original y el error
            enableButtons(false); // Asegurar que la descarga esté deshabilitada
            if (resetBtn) resetBtn.disabled = false; // Pero permitir reset
        } finally {
            hideElement(loading); // Ocultar loading siempre al finalizar
        }
    };

    const downloadImage = () => {
        if (!processedBlob || !processedBlobUrl) {
            console.warn('No hay imagen procesada para descargar.');
            return;
        }

        const link = document.createElement('a');
        // Usar el nombre del archivo original sin extensión y añadir la extensión según el formato
        const name = originalFile?.name.replace(/\.[^/.]+$/, '') || 'processed_image';
        // La extensión debe coincidir con el mime type del blob
        let fileExtension = 'png'; // Por defecto
        if (processedBlob.type === 'image/jpeg') fileExtension = 'jpg';
        else if (processedBlob.type === 'image/webp') fileExtension = 'webp';


        link.href = processedBlobUrl;
        link.download = `${name}_nobg.${fileExtension}`; // Nombre del archivo
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };


    // --- Eventos ---
    // Verificar que los elementos existan antes de añadir listeners
    if (selectBtn) {
        selectBtn.addEventListener('click', () => fileInput?.click()); // Usar optional chaining
    }
    if (fileInput) {
        fileInput.addEventListener('change', e => handleFileSelect(e.target.files?.[0])); // Usar optional chaining
    }

    if (dropArea) { // Corregido dropZone a dropArea
        dropArea.addEventListener('dragover', e => {
            e.preventDefault();
            dropArea.classList.add('dragover');
        });
        dropArea.addEventListener('dragleave', e => {
            e.preventDefault();
            dropArea.classList.remove('dragover');
        });
        dropArea.addEventListener('drop', e => {
            e.preventDefault();
            dropArea.classList.remove('dragover');
            const file = e.dataTransfer?.files?.[0]; // Usar optional chaining
            if (file) handleFileSelect(file);
        });
        // Eliminar este listener si no quieres que todo el drop area sea clickeable
        // Si lo mantienes, asegúrate de que no interfiera con selectBtn
         dropArea.addEventListener('click', e => {
             // Solo abrir el selector de archivo si el click NO fue en el botón "Seleccionar archivo"
             if (selectBtn && !selectBtn.contains(e.target)) {
                 fileInput?.click(); // Usar optional chaining
             }
         });
    }


    if (removeBgBtn) removeBgBtn.addEventListener('click', processImage);
    if (downloadBtn) downloadBtn.addEventListener('click', downloadImage);
    if (resetBtn) resetBtn.addEventListener('click', resetApp);

    // Cerrar mensajes
    if (successCloseBtn) successCloseBtn.addEventListener('click', hideMessages);
    if (errorCloseBtn) errorCloseBtn.addEventListener('click', hideMessages);


    // --- Configuración de Partículas de Nieve (Integrada) ---
    let flakes = [];
    const flakeCount = 100; // Número de copos

    function initFlakes() {
        if (!snowCanvas || !ctx) return; // Asegurar que el canvas existe
        flakes = [];
        for (let i = 0; i < flakeCount; i++) {
            flakes.push({
                x: Math.random() * snowCanvas.width,
                y: Math.random() * snowCanvas.height,
                radius: Math.random() * 3 + 2, // Tamaño entre 2 y 5
                speedY: Math.random() * 1 + 0.5, // Velocidad de caída entre 0.5 y 1.5
                speedX: Math.random() * 1 - 0.5, // Movimiento horizontal entre -0.5 y 0.5
            });
        }
    }

    function drawFlakes() {
        if (!snowCanvas || !ctx) return; // Asegurar que el canvas y contexto existen

        ctx.clearRect(0, 0, snowCanvas.width, snowCanvas.height); // Limpiar el canvas

        for (let flake of flakes) {
            ctx.beginPath();
            ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 255, 255, 0.8)"; // Copos ligeramente transparentes
            ctx.fill();

            // Movimiento
            flake.y += flake.speedY;
            flake.x += flake.speedX;

            // Reaparecer arriba si sale por abajo o por los lados
            if (flake.y > snowCanvas.height) {
                flake.y = -flake.radius; // Reaparecer justo encima del canvas
                flake.x = Math.random() * snowCanvas.width; // Posición horizontal aleatoria
            }
            // Reaparecer en el lado opuesto si sale por los lados (efecto wrap-around)
             if (flake.x < -flake.radius) {
                 flake.x = snowCanvas.width + flake.radius;
             } else if (flake.x > snowCanvas.width + flake.radius) {
                 flake.x = -flake.radius;
             }
        }

        requestAnimationFrame(drawFlakes); // Continuar la animación
    }

    // Ajustar canvas al tamaño de la ventana
    function resizeCanvas() {
        if (!snowCanvas) return;
        // Ajustar el tamaño del canvas
        snowCanvas.width = window.innerWidth;
        snowCanvas.height = window.innerHeight;
        // Reiniciar la posición de los copos para el nuevo tamaño
        initFlakes(); // Llama a initFlakes sin pasar el número, usa la variable flakeCount
    }

    // Evento para redimensionar el canvas
    window.addEventListener("resize", resizeCanvas);

    // --- Inicialización ---
    // Inicializar el canvas y la animación de nieve
    resizeCanvas(); // Configura el tamaño inicial y crea los copos
    drawFlakes(); // Comienza el bucle de animación

    // Inicializar el estado de la aplicación principal
    resetApp(); // Establecer el estado inicial de la UI
});

// Eliminado el segundo document.addEventListener("DOMContentLoaded")
// Eliminado el stray drawFlakes() al final del script