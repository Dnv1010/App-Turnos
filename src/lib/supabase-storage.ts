import { supabaseAdmin } from './supabase-server'

export interface UploadResult {
  fileId: string;
  webViewLink: string;
}

/**
 * Sube una imagen base64 a Supabase Storage
 * Reemplaza la funcionalidad de uploadToDrive
 *
 * @param base64Data - Datos de la imagen en base64 (con o sin prefijo data:image/...)
 * @param fileName - Nombre del archivo
 * @param bucket - Bucket de Supabase ('fotos-turnos' o 'fotos-foraneos')
 * @returns Objeto con fileId (path) y webViewLink (URL pública)
 */
export async function uploadToStorage(
  base64Data: string,
  fileName: string,
  bucket: string = 'fotos-turnos'
): Promise<UploadResult> {
  if (!base64Data) {
    throw new Error('[Storage] base64Data es undefined o vacío');
  }

  // Limpiar prefijo base64 si existe
  const base64Clean = base64Data.includes(',')
    ? base64Data.split(',')[1]
    : base64Data;

  // Convertir a Buffer
  const buffer = Buffer.from(base64Clean, 'base64');

  // Crear path único con año y timestamp
  const year = new Date().getFullYear();
  const timestamp = Date.now();
  const path = `${year}/${timestamp}_${fileName}`;

  // Subir a Supabase Storage
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    throw new Error(`[Storage] Upload failed: ${error.message}`);
  }

  // Obtener URL pública
  const { data: urlData } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(path);

  return {
    fileId: path,
    webViewLink: urlData.publicUrl
  };
}

/**
 * Alias de uploadToStorage para mantener compatibilidad con código existente
 * @deprecated Use uploadToStorage instead
 */
export const uploadToDrive = uploadToStorage;
