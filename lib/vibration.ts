/**
 * Vibration Utilities for Web
 * استخدام Web Vibration API
 */

/**
 * اهتزاز خفيف (للخطأ)
 */
export function vibrateError(): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    // نمط اهتزاز: 100ms اهتزاز، 50ms توقف، 100ms اهتزاز
    navigator.vibrate([100, 50, 100]);
  }
}

/**
 * اهتزاز قصير (للنجاح)
 */
export function vibrateSuccess(): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    // اهتزاز قصير واحد
    navigator.vibrate(50);
  }
}

/**
 * اهتزاز مخصص
 */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

/**
 * إيقاف الاهتزاز
 */
export function stopVibration(): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(0);
  }
}

