/**
 * Utilidades de criptografía para encriptación de Cédula de Identidad
 * Usa Web Crypto API con AES-GCM para encriptación simétrica
 */

export interface EncryptedPhoto {
  encryptedData: ArrayBuffer;
  iv: Uint8Array;
  salt: Uint8Array;
  keyHash: string;
}

/**
 * Deriva una clave de encriptación a partir de una contraseña usando PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true, // extractable: generateKeyHash exporta la clave para verificar la contraseña
    ['encrypt', 'decrypt']
  );
}

/**
 * Genera un hash de la clave para verificación
 */
async function generateKeyHash(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('raw', key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', exported);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Comprueba si el entorno puede comprimir imágenes (navegador con canvas).
 * En jsdom/Node no hay canvas: se devuelve el blob original.
 */
function puedeComprimirImagen(): boolean {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || typeof URL === 'undefined'
      || typeof URL.createObjectURL !== 'function') {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    if (typeof canvas.toBlob !== 'function') return false;
    return typeof canvas.getContext === 'function' && canvas.getContext('2d') !== null;
  } catch {
    return false;
  }
}

/**
 * Comprime una imagen antes de encriptar (reduce tamaño manteniendo calidad)
 */
async function compressImage(blob: Blob, maxWidth: number = 800, quality: number = 0.7): Promise<Blob> {
  if (!puedeComprimirImagen()) return blob;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      // Calcular nuevas dimensiones manteniendo aspect ratio
      let { width, height } = img;
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob((compressedBlob) => {
        resolve(compressedBlob || blob);
      }, 'image/jpeg', quality);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob); // Fallback to original
    };
    
    img.src = url;
  });
}

/**
 * Convierte Blob a ArrayBuffer
 */
function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer();
}

/**
 * Encripta una foto de CI usando AES-GCM
 * @param photoBlob - Blob de la imagen (foto de la CI)
 * @param password - Contraseña del usuario para derivar la clave
 * @returns Objeto con datos encriptados, IV, salt y hash de clave
 */
export async function encryptCIPhoto(
  photoBlob: Blob,
  password: string
): Promise<EncryptedPhoto> {
  try {
    // 1. Comprimir imagen para reducir tamaño
    const compressedBlob = await compressImage(photoBlob);
    
    // 2. Convertir a ArrayBuffer
    const imageData = await blobToArrayBuffer(compressedBlob);
    
    // 3. Generar salt aleatorio
    const salt = crypto.getRandomValues(new Uint8Array(16));
    
    // 4. Derivar clave de la contraseña
    const key = await deriveKey(password, salt);
    
    // 5. Generar IV aleatorio para AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // 6. Encriptar datos (copiamos a un buffer del realm actual: en Node/jsdom
    //    el ArrayBuffer devuelto por WebCrypto puede pertenecer a otro realm).
    const encryptedRaw = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      imageData
    );
    const encryptedData = new Uint8Array(encryptedRaw).buffer as ArrayBuffer;
    
    // 7. Generar hash de la clave para verificación
    const keyHash = await generateKeyHash(key);
    
    return {
      encryptedData,
      iv,
      salt,
      keyHash,
    };
  } catch (error) {
    console.error('Error encrypting CI photo:', error);
    throw new Error(`Failed to encrypt CI photo: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Desencripta una foto de CI usando AES-GCM
 * @param encryptedPhoto - Objeto con datos encriptados
 * @param password - Contraseña del usuario
 * @returns Blob con la imagen desencriptada
 */
export async function decryptCIPhoto(
  encryptedPhoto: EncryptedPhoto,
  password: string
): Promise<Blob> {
  try {
    const { encryptedData, iv, salt, keyHash } = encryptedPhoto;
    
    // 1. Derivar clave de la contraseña
    const key = await deriveKey(password, salt);
    
    // 2. Verificar hash de clave (opcional, para detección temprana de contraseña incorrecta)
    const computedHash = await generateKeyHash(key);
    if (computedHash !== keyHash) {
      throw new Error('Contraseña incorrecta: el hash de la clave no coincide');
    }
    
    // 3. Desencriptar datos
    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      encryptedData
    );
    
    // 4. Convertir a Blob
    return new Blob([decryptedData], { type: 'image/jpeg' });
  } catch (error) {
    console.error('Error decrypting CI photo:', error);
    throw new Error(`Failed to decrypt CI photo: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Verifica si el navegador soporta Web Crypto API
 */
export function isCryptoSupported(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.encrypt === 'function' &&
    typeof crypto.subtle.decrypt === 'function' &&
    typeof crypto.subtle.importKey === 'function' &&
    typeof crypto.subtle.deriveKey === 'function'
  );
}

/**
 * Genera una contraseña aleatoria segura para uso interno
 */
export function generateSecurePassword(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}