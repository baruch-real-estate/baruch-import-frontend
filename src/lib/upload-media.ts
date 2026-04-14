// Funciones para descargar y subir imágenes/archivos a Strapi

import { strapiClient } from './strapi-client';

// Cache en memoria para evitar búsquedas repetidas de la misma URL
const fileCache = new Map<string, number | null>();

// Descargar archivo desde URL
async function downloadFile(url: string): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error descargando archivo: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Obtener nombre de archivo de la URL
    const urlPath = new URL(url).pathname;
    const filename = urlPath.split('/').pop() || 'file';

    // Obtener MIME type del header o inferirlo
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    let mimeType = contentType;

    // Inferir tipo desde extensión si no hay content-type
    if (contentType === 'application/octet-stream') {
      const ext = filename.split('.').pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
      mimeType = mimeTypes[ext || ''] || 'application/octet-stream';
    }

    return { buffer, mimeType, filename };
  } catch (error) {
    throw new Error(`Error descargando archivo desde ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Subir imagen desde URL
export async function uploadImageFromUrl(url: string): Promise<number | null> {
  try {
    // Verificar cache primero
    if (fileCache.has(url)) {
      const cachedId = fileCache.get(url);
      if (cachedId) {
        console.log(`  ♻️  Imagen encontrada en cache (ID: ${cachedId}): ${url}`);
        return cachedId;
      }
      // Si está en cache como null, significa que no existe, pero intentaremos buscar de nuevo
    }

    // Buscar si ya existe en Strapi
    console.log(`  🔍 Buscando imagen existente por URL: ${url.substring(0, 80)}...`);
    const existingId = await strapiClient.findFileByUrlOrName(url);

    if (existingId) {
      console.log(`  ✅ Imagen encontrada en Strapi (ID: ${existingId}), reutilizando`);
      fileCache.set(url, existingId);
      return existingId;
    } else {
      console.log(`  📥 Imagen no encontrada, se descargará y subirá nueva`);
    }

    // Si no existe, descargar y subir
    console.log(`  📥 Descargando imagen: ${url}`);
    const { buffer, mimeType, filename } = await downloadFile(url);

    console.log(`  ⬆️  Subiendo a Strapi: ${filename} (${mimeType})`);
    const uploadResult = await strapiClient.uploadFile(buffer, filename, mimeType);

    console.log(`  ✅ Imagen subida con ID: ${uploadResult.id}`);

    // Guardar en cache tanto la URL original como la URL de Strapi (si existe)
    fileCache.set(url, uploadResult.id);
    if (uploadResult.url) {
      // También mapear la URL de Strapi al mismo ID
      fileCache.set(uploadResult.url, uploadResult.id);
      // Si la URL de Strapi es diferente, también mapearla
      const strapiFullUrl = uploadResult.url.startsWith('http')
        ? uploadResult.url
        : `${process.env.STRAPI_HOST || 'http://localhost:1337'}${uploadResult.url}`;
      if (strapiFullUrl !== url) {
        fileCache.set(strapiFullUrl, uploadResult.id);
      }
    }

    return uploadResult.id;
  } catch (error) {
    const errorMsg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
    console.error(`  ❌ Error subiendo imagen desde ${url}:`, errorMsg);
    fileCache.set(url, null); // Cachear el fallo para evitar reintentos
    return null;
  }
}

// Subir archivo (PDF, etc.) desde URL
export async function uploadFileFromUrl(url: string): Promise<number | null> {
  try {
    // Verificar cache primero
    if (fileCache.has(url)) {
      const cachedId = fileCache.get(url);
      if (cachedId) {
        console.log(`  ♻️  Archivo encontrado en cache (ID: ${cachedId}): ${url}`);
        return cachedId;
      }
    }

    // Buscar si ya existe en Strapi
    console.log(`  🔍 Buscando archivo existente por URL: ${url.substring(0, 80)}...`);
    const existingId = await strapiClient.findFileByUrlOrName(url);

    if (existingId) {
      console.log(`  ✅ Archivo encontrado en Strapi (ID: ${existingId}), reutilizando`);
      fileCache.set(url, existingId);
      return existingId;
    } else {
      console.log(`  📥 Archivo no encontrado, se descargará y subirá nuevo`);
    }

    // Si no existe, descargar y subir
    console.log(`  📥 Descargando archivo: ${url}`);
    const { buffer, mimeType, filename } = await downloadFile(url);

    console.log(`  ⬆️  Subiendo a Strapi: ${filename} (${mimeType})`);
    const uploadResult = await strapiClient.uploadFile(buffer, filename, mimeType);

    console.log(`  ✅ Archivo subido con ID: ${uploadResult.id}`);

    // Guardar en cache tanto la URL original como la URL de Strapi (si existe)
    fileCache.set(url, uploadResult.id);
    if (uploadResult.url) {
      // También mapear la URL de Strapi al mismo ID
      fileCache.set(uploadResult.url, uploadResult.id);
      // Si la URL de Strapi es diferente, también mapearla
      const strapiFullUrl = uploadResult.url.startsWith('http')
        ? uploadResult.url
        : `${process.env.STRAPI_HOST || 'http://localhost:1337'}${uploadResult.url}`;
      if (strapiFullUrl !== url) {
        fileCache.set(strapiFullUrl, uploadResult.id);
      }
    }

    return uploadResult.id;
  } catch (error) {
    console.error(`  ❌ Error subiendo archivo desde ${url}:`, error);
    fileCache.set(url, null);
    return null;
  }
}

// Subir múltiples imágenes (gallery)
export async function uploadMultipleImages(
  urls: string[],
  delayBetweenUploads: number = 500
): Promise<number[]> {
  const uploadedIds: number[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i].trim();
    if (!url) continue;

    const mediaId = await uploadImageFromUrl(url);
    if (mediaId) {
      uploadedIds.push(mediaId);
    }

    // Pausa entre uploads para evitar rate limiting
    if (i < urls.length - 1 && delayBetweenUploads > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenUploads));
    }
  }

  return uploadedIds;
}

// Validar que una URL sea accesible (sin descargar completamente)
export async function validateUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    // Si HEAD falla, intentar GET pero solo leer headers
    try {
      const response = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
      return response.ok || response.status === 206; // 206 es Partial Content
    } catch {
      return false;
    }
  }
}

