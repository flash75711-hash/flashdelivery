/**
 * Web-only Alert System using SweetAlert2
 * Single Source of Truth for all notifications
 */

import Swal from 'sweetalert2';

/**
 * Toast notification - للإشعارات الداخلية السريعة (خفيف، لا يغطي الشاشة)
 */
export function showToast(
  message: string,
  type: 'success' | 'error' | 'warning' | 'info' = 'info',
  duration: number = 2000
): void {
  const iconMap: Record<string, 'success' | 'error' | 'warning' | 'info'> = {
    success: 'success',
    error: 'error',
    warning: 'warning',
    info: 'info',
  };

  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: iconMap[type] || 'info',
    title: message,
    showConfirmButton: false,
    timer: duration,
    timerProgressBar: false, // إزالة شريط التقدم لتقليل الحجم
    width: 'auto',
    maxWidth: '350px', // تحديد أقصى عرض
    padding: '0.5rem 0.75rem', // تقليل padding
    background: '#fff',
    backdrop: false, // إزالة الخلفية المعتمة
    allowOutsideClick: true,
    allowEscapeKey: true,
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', Swal.stopTimer);
      toast.addEventListener('mouseleave', Swal.resumeTimer);
    },
    customClass: {
      popup: 'swal2-toast-light',
      title: 'swal2-toast-title-light',
    },
  });
}

/**
 * Alert dialog with confirmation button
 */
export async function showAlert(
  title: string,
  message: string,
  options?: {
    confirmText?: string;
    cancelText?: string;
    type?: 'success' | 'error' | 'warning' | 'info' | 'question';
    onConfirm?: () => void | Promise<void>;
    onCancel?: () => void;
    showCancel?: boolean;
  }
): Promise<boolean> {
  try {
    const iconMap: Record<string, 'success' | 'error' | 'warning' | 'info' | 'question'> = {
      success: 'success',
      error: 'error',
      warning: 'warning',
      info: 'info',
      question: 'question',
    };

    const result = await Swal.fire({
      title,
      text: message,
      icon: iconMap[options?.type || 'info'] || 'info',
      showCancelButton: options?.showCancel !== false && (!!options?.onCancel || options?.showCancel === true),
      confirmButtonText: options?.confirmText || 'حسناً',
      cancelButtonText: options?.cancelText || 'إلغاء',
      confirmButtonColor: '#007AFF',
      cancelButtonColor: '#999',
      reverseButtons: true,
    });

    if (result.isConfirmed) {
      if (options?.onConfirm) {
        await options.onConfirm();
      }
      return true;
    } else if (result.isDismissed) {
      if (options?.onCancel) {
        options.onCancel();
      }
      return false;
    }

    return result.isConfirmed;
  } catch (error) {
    console.error('Error showing SweetAlert2:', error);
    // Fallback to browser alert
    if (window.confirm(`${title}\n\n${message}`)) {
      if (options?.onConfirm) {
        await options.onConfirm();
      }
      return true;
    } else {
      if (options?.onCancel) {
        options.onCancel();
      }
      return false;
    }
  }
}

/**
 * Simple alert without cancel button
 */
export async function showSimpleAlert(
  title: string,
  message: string,
  type: 'success' | 'error' | 'warning' | 'info' = 'info'
): Promise<void> {
  await showAlert(title, message, {
    type,
    showCancel: false,
  });
}

/**
 * Confirmation dialog
 */
export async function showConfirm(
  title: string,
  message: string,
  options?: {
    confirmText?: string;
    cancelText?: string;
    type?: 'warning' | 'question';
    onConfirm?: () => void | Promise<void>;
    onCancel?: () => void;
  }
): Promise<boolean> {
  return showAlert(title, message, {
    ...options,
    showCancel: true,
    type: options?.type || 'question',
  });
}

