// Elementos
const fileInput = document.getElementById('fileInput');
const dropArea = document.getElementById('dropArea');
const selectBtn = document.getElementById('selectBtn');
const previewArea = document.getElementById('previewArea');
const previewImage = document.getElementById('previewImage');
const imageInfo = document.getElementById('imageInfo');
const removeBgBtn = document.getElementById('removeBgBtn');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');
const formatSelect = document.getElementById('formatSelect');
const loading = document.getElementById('loading');
const successMessage = document.getElementById('successMessage');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');
const successCloseBtn = document.getElementById('successCloseBtn');
const errorCloseBtn = document.getElementById('errorCloseBtn');

let uploadedImage = null;
let processedImageBlob = null;

// Botón de selección
selectBtn.addEventListener('click', () => fileInput.click());

// Función para redimensionar imagen
function resizeImage(file, maxWidth = 1024, maxHeight = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const scale = Math.min(maxWidth / width, maxHeight / height);
          width *= scale;
          height *= scale;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("No se pudo redimensionar la imagen."));
        }, file.type);
      };
      img.src = e.target.result;
    };

    reader.readAsDataURL(file);
  });
}

// Evento de carga por input
fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    handleImage(fileInput.files[0]);
  }
});

// Eventos de arrastrar y soltar
dropArea.addEventListener('dragover', e => {
  e.preventDefault();
  dropArea.classList.add('highlight');
});

dropArea.addEventListener('dragleave', () => {
  dropArea.classList.remove('highlight');
});

dropArea.addEventListener('drop', e => {
  e.preventDefault();
  dropArea.classList.remove('highlight');
  const file = e.dataTransfer.files[0];
  if (file) handleImage(file);
});

// Función para manejar imagen seleccionada
function handleImage(file) {
  if (!file.type.startsWith('image/')) {
    showError('El archivo no es una imagen válida.');
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showError('La imagen no debe superar los 5MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    previewImage.src = reader.result;
    previewArea.classList.remove('hidden');
    uploadedImage = file;
    imageInfo.textContent = `Tamaño: ${(file.size / 1024).toFixed(1)} KB`;
  };
  reader.readAsDataURL(file);
}

// Quitar fondo
removeBgBtn.addEventListener('click', async () => {
  if (!uploadedImage) {
    showError('Primero debes subir una imagen.');
    return;
  }

  try {
    showLoading();
    const resizedBlob = await resizeImage(uploadedImage);
    const formData = new FormData();
    formData.append('image', resizedBlob, uploadedImage.name);

    const response = await fetch('/api/remove-background', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) throw new Error('Error al procesar la imagen.');

    const blob = await response.blob();
    processedImageBlob = blob;
    const url = URL.createObjectURL(blob);

    previewImage.src = url;
    downloadBtn.disabled = false;
    showSuccess();
  } catch (err) {
    showError('No se pudo quitar el fondo. Intenta nuevamente.');
  } finally {
    hideLoading();
  }
});

// Descargar imagen procesada
downloadBtn.addEventListener('click', () => {
  if (!processedImageBlob) return;

  const format = formatSelect.value;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(processedImageBlob);
  link.download = `sin_fondo.${format}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

// Resetear formulario
resetBtn.addEventListener('click', () => {
  previewArea.classList.add('hidden');
  previewImage.src = '';
  imageInfo.textContent = '';
  downloadBtn.disabled = true;
  uploadedImage = null;
  processedImageBlob = null;
  fileInput.value = '';
});

// Mensajes
successCloseBtn.addEventListener('click', () => successMessage.classList.add('hidden'));
errorCloseBtn.addEventListener('click', () => errorMessage.classList.add('hidden'));

function showLoading() {
  loading.classList.remove('hidden');
}

function hideLoading() {
  loading.classList.add('hidden');
}

function showSuccess() {
  successMessage.classList.remove('hidden');
}

function showError(message) {
  errorText.textContent = message;
  errorMessage.classList.remove('hidden');
}
