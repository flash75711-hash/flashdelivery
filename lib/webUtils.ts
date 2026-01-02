/**
 * Web APIs Utilities - Single Source of Truth for Web-only functionality
 * هذه المكتبة توفر Web APIs خالصة بدون أي اعتماد على Expo أو Native
 */

/**
 * WebView Detection - للتحقق إذا كان الموقع يعمل داخل WebView
 */
export function isWebView(): boolean {
  if (typeof window === 'undefined') return false;
  
  // التحقق من User Agent
  const userAgent = window.navigator.userAgent.toLowerCase();
  const webViewPatterns = [
    'wv', // Android WebView
    'webview', // Generic WebView
    'iphone;', // iOS WebView (sometimes)
  ];
  
  const isWebViewUA = webViewPatterns.some(pattern => userAgent.includes(pattern));
  
  // التحقق من window properties
  const hasWebViewProps = 
    !(window as any).chrome || 
    (window as any).ReactNativeWebView !== undefined ||
    (window as any).webkit?.messageHandlers !== undefined;
  
  return isWebViewUA || hasWebViewProps;
}

/**
 * Geolocation API - Web-only location service
 */
export interface LocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}

export class LocationError extends Error {
  constructor(
    message: string,
    public code: number,
    public permissionDenied: boolean = false
  ) {
    super(message);
    this.name = 'LocationError';
  }
}

// تخزين حالة الإذن لتجنب الطلبات المتكررة
let permissionStatus: 'granted' | 'denied' | 'prompt' | null = null;
let permissionCheckPromise: Promise<boolean> | null = null;

/**
 * التحقق من حالة الإذن بدون طلب جديد
 */
async function checkPermissionStatus(): Promise<'granted' | 'denied' | 'prompt'> {
  // استخدام navigator.permissions.query إذا كان متاحاً (Chrome, Firefox)
  if ('permissions' in navigator && 'query' in navigator.permissions) {
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return result.state as 'granted' | 'denied' | 'prompt';
    } catch (e) {
      // بعض المتصفحات لا تدعم query لـ geolocation
      console.log('Permission query not supported, will check via getCurrentPosition');
    }
  }
  
  // إذا لم يكن query متاحاً، نرجع 'prompt' للسماح بالتحقق
  return 'prompt';
}

/**
 * طلب إذن الوصول للموقع (محسّن - يتحقق من الإذن أولاً)
 */
export async function requestLocationPermission(): Promise<boolean> {
  if (!navigator.geolocation) {
    throw new LocationError('Geolocation غير مدعوم في هذا المتصفح', 0, false);
  }

  // إذا كان هناك promise قيد التنفيذ، ننتظرها
  if (permissionCheckPromise) {
    return permissionCheckPromise;
  }

  // التحقق من حالة الإذن المخزنة
  if (permissionStatus === 'granted') {
    return true;
  }
  
  if (permissionStatus === 'denied') {
    return false;
  }

  // التحقق من حالة الإذن أولاً
  permissionCheckPromise = (async () => {
    try {
      const status = await checkPermissionStatus();
      
      if (status === 'granted') {
        permissionStatus = 'granted';
        return true;
      }
      
      if (status === 'denied') {
        permissionStatus = 'denied';
        return false;
      }

      // إذا كان prompt، نحاول جلب الموقع (سيطلب الإذن تلقائياً)
      // استخدام maximumAge كبير و timeout أطول لتقليل الطلبات
      return new Promise<boolean>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => {
            permissionStatus = 'granted';
            resolve(true);
          },
          (error) => {
            if (error.code === error.PERMISSION_DENIED) {
              permissionStatus = 'denied';
              resolve(false);
            } else {
              // أخطاء أخرى (timeout, unavailable) لا تعني رفض الإذن
              // نرجع true لأن الإذن قد يكون موجوداً لكن الموقع غير متاح حالياً
              permissionStatus = 'granted'; // نفترض أن الإذن موجود
              resolve(true);
            }
          },
          { 
            enableHighAccuracy: false, // تقليل الدقة لتسريع الطلب
            timeout: 3000, // timeout قصير للتحقق السريع
            maximumAge: 60000 // استخدام موقع قديم حتى 60 ثانية لتسريع الطلب
          }
        );
      });
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    } finally {
      permissionCheckPromise = null;
    }
  })();

  return permissionCheckPromise;
}

/**
 * جلب الموقع الحالي
 */
export async function getCurrentLocation(
  options: LocationOptions = {}
): Promise<LocationCoordinates> {
  if (!navigator.geolocation) {
    throw new LocationError('Geolocation غير مدعوم في هذا المتصفح', 0, false);
  }

  const {
    enableHighAccuracy = true,
    timeout = 15000, // زيادة timeout من 10 إلى 15 ثانية
    maximumAge = 30000, // استخدام موقع قديم حتى 30 ثانية كقيمة افتراضية (بدلاً من 0)
  } = options;

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? undefined,
          altitude: position.coords.altitude ?? null,
          altitudeAccuracy: position.coords.altitudeAccuracy ?? null,
          heading: position.coords.heading ?? null,
          speed: position.coords.speed ?? null,
        });
      },
      (error) => {
        let message = 'فشل الحصول على الموقع';
        let permissionDenied = false;

        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'تم رفض إذن الوصول للموقع';
            permissionDenied = true;
            // تحديث حالة الإذن المخزنة
            permissionStatus = 'denied';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'الموقع غير متاح';
            break;
          case error.TIMEOUT:
            message = 'انتهت مهلة الحصول على الموقع';
            break;
        }

        reject(new LocationError(message, error.code, permissionDenied));
      },
      {
        enableHighAccuracy,
        timeout,
        maximumAge,
      }
    );
  });
}

/**
 * مراقبة الموقع (Watch Position)
 */
export function watchPosition(
  callback: (location: LocationCoordinates) => void,
  errorCallback?: (error: LocationError) => void,
  options: LocationOptions = {}
): number {
  if (!navigator.geolocation) {
    const error = new LocationError('Geolocation غير مدعوم في هذا المتصفح', 0, false);
    if (errorCallback) errorCallback(error);
    return -1;
  }

  const {
    enableHighAccuracy = true,
    timeout = 15000, // زيادة timeout من 10 إلى 15 ثانية
    maximumAge = 30000, // استخدام موقع قديم حتى 30 ثانية كقيمة افتراضية (بدلاً من 0)
  } = options;

  return navigator.geolocation.watchPosition(
    (position) => {
      callback({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? undefined,
        altitude: position.coords.altitude ?? null,
        altitudeAccuracy: position.coords.altitudeAccuracy ?? null,
        heading: position.coords.heading ?? null,
        speed: position.coords.speed ?? null,
      });
    },
    (error) => {
      let message = 'فشل الحصول على الموقع';
      let permissionDenied = false;

      switch (error.code) {
        case error.PERMISSION_DENIED:
          message = 'تم رفض إذن الوصول للموقع';
          permissionDenied = true;
          // تحديث حالة الإذن المخزنة
          permissionStatus = 'denied';
          break;
        case error.POSITION_UNAVAILABLE:
          message = 'الموقع غير متاح';
          break;
        case error.TIMEOUT:
          message = 'انتهت مهلة الحصول على الموقع';
          break;
      }

      if (errorCallback) {
        errorCallback(new LocationError(message, error.code, permissionDenied));
      }
    },
    {
      enableHighAccuracy,
      timeout,
      maximumAge,
    }
  );
}

/**
 * إيقاف مراقبة الموقع
 */
export function clearWatch(watchId: number): void {
  if (navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
  }
}

/**
 * Camera/File Upload - Web-only file picker
 */
export interface ImagePickerOptions {
  multiple?: boolean;
  accept?: string;
  maxSize?: number; // in bytes
}

export interface ImageFile {
  file: File;
  uri: string; // blob URL
  name: string;
  type: string;
  size: number;
}

/**
 * فتح ملف picker للصور
 */
export function pickImage(options: ImagePickerOptions = {}): Promise<ImageFile[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.accept || 'image/*';
    input.multiple = options.multiple || false;

    input.onchange = (event) => {
      const files = (event.target as HTMLInputElement).files;
      if (!files || files.length === 0) {
        // إرجاع مصفوفة فارغة بدلاً من رفض الـ Promise
        resolve([]);
        return;
      }

      const imageFiles: ImageFile[] = [];
      const filePromises: Promise<void>[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // التحقق من حجم الملف
        if (options.maxSize && file.size > options.maxSize) {
          reject(new Error(`حجم الملف ${file.name} أكبر من المسموح (${(options.maxSize / 1024 / 1024).toFixed(2)} MB)`));
          return;
        }

        // التحقق من نوع الملف
        if (!file.type.startsWith('image/')) {
          reject(new Error(`الملف ${file.name} ليس صورة`));
          return;
        }

        const promise = new Promise<void>((resolveFile) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const uri = e.target?.result as string;
            imageFiles.push({
              file,
              uri,
              name: file.name,
              type: file.type,
              size: file.size,
            });
            resolveFile();
          };
          reader.onerror = () => {
            reject(new Error(`فشل قراءة الملف ${file.name}`));
          };
          reader.readAsDataURL(file);
        });

        filePromises.push(promise);
      }

      Promise.all(filePromises)
        .then(() => resolve(imageFiles))
        .catch(reject);
    };

    input.oncancel = () => {
      // إرجاع مصفوفة فارغة عند الإلغاء بدلاً من رفض الـ Promise
      // هذا يمنع ظهور خطأ في console عند إلغاء المستخدم
      resolve([]);
    };

    input.click();
  });
}

/**
 * تحويل File إلى Blob URL
 */
export function fileToBlobURL(file: File): string {
  return URL.createObjectURL(file);
}

/**
 * تحويل Blob URL إلى Base64
 */
export async function blobURLToBase64(blobURL: string): Promise<string> {
  const response = await fetch(blobURL);
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  return btoa(String.fromCharCode(...uint8Array));
}

/**
 * Linking - Web-only navigation
 */
export function openURL(url: string, target: '_blank' | '_self' = '_blank'): void {
  window.open(url, target);
}

export function canOpenURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Browser - Web-only browser operations
 */
export function openBrowserAsync(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const newWindow = window.open(url, '_blank');
    if (newWindow) {
      // مراقبة إغلاق النافذة
      const checkClosed = setInterval(() => {
        if (newWindow.closed) {
          clearInterval(checkClosed);
          resolve();
        }
      }, 100);
      
      // timeout بعد 5 دقائق
      setTimeout(() => {
        clearInterval(checkClosed);
        resolve();
      }, 300000);
    } else {
      reject(new Error('فشل فتح المتصفح - قد يكون محظوراً من قبل popup blocker'));
    }
  });
}

/**
 * دالة مساعدة للتحقق من دعم Web APIs
 */
export function checkWebAPISupport(): {
  geolocation: boolean;
  fileReader: boolean;
  blob: boolean;
} {
  return {
    geolocation: 'geolocation' in navigator,
    fileReader: typeof FileReader !== 'undefined',
    blob: typeof Blob !== 'undefined',
  };
}

