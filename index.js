// importamos las librerias necesarias.
import {removeBackground} from '@imgly/background-removal-node'; // biblioteca importada.
import fs from 'fs'; // modulo fs que nos permite leer archivos.
import path from 'path'; // modulo path que nos permite leer la ruta de un archivo.

// se definen las rutas de los archivos de entrada y salida.
const inputPath = "./cupcake3.jpg";
const outputPath = "./output-cupcake-3.png";

// se valida si el archivo de entrada existe.
if (!fs.existsSync(inputPath)) {
    console.error(`Imput file not found ${inputPath}`);
    process.exit(1);
};

// se crea una variable que contendra la ruta absoluta de la imagen.
const absolutePath = path.resolve(inputPath); // el modulo path nos permite obtener la ruta absoluta de un archivo o convertir la ruta relativa a absoluta.
const imageUrl = `file://${absolutePath}` // se crea una variable que contendra la ruta absoluta de la imagen.

// se crea una funcion asincrona que convierte un blob a un buffer.
async function blobToBuffer(blob) {
    const arrayBuffer = await blob.arrayBuffer()
    return Buffer.from(arrayBuffer)
};

// se remueve el fondo de la imagen y se guarda en la ruta especificada.
removeBackground(imageUrl)
    .then(async blob => {
        console.log("Background removed successfully");
        const buffer = await blobToBuffer(blob)
        fs.writeFileSync(outputPath, buffer); // se escribe el archivo en la ruta especificada.
    })
    .catch(error => {
        console.error(error);
    });