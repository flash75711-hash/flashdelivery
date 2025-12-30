/**
 * PIN Input Component
 * مكون إدخال PIN مع 6 خانات منفصلة و Auto-focus
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, TextInput, StyleSheet, Platform } from 'react-native';
import responsive from '@/utils/responsive';

interface PinInputProps {
  length?: number;
  value: string;
  onChange: (pin: string) => void;
  onComplete?: (pin: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
}

export default function PinInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  error = false,
  autoFocus = true,
}: PinInputProps) {
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(autoFocus ? 0 : null);

  // تحديث قيمة PIN عند تغيير value من الخارج
  useEffect(() => {
    if (value.length === length && onComplete) {
      onComplete(value);
    }
  }, [value, length, onComplete]);

  // Auto-focus على أول خانة عند التحميل
  useEffect(() => {
    if (autoFocus && inputRefs.current[0] && !disabled) {
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, [autoFocus, disabled]);

  const handleChange = useCallback((text: string, index: number) => {
    // السماح بالأرقام فقط
    const numericText = text.replace(/\D/g, '');
    
    if (numericText.length > 1) {
      // إذا تم لصق نص متعدد الأرقام
      const digits = numericText.slice(0, length).split('');
      const newPin = digits.join('');
      onChange(newPin);
      
      // Focus على آخر خانة مملوءة
      const lastFilledIndex = Math.min(digits.length - 1, length - 1);
      inputRefs.current[lastFilledIndex]?.focus();
      setFocusedIndex(lastFilledIndex);
    } else if (numericText.length === 1) {
      // إدخال رقم واحد
      const newPin = value.split('');
      newPin[index] = numericText;
      const updatedPin = newPin.join('').slice(0, length);
      onChange(updatedPin);
      
      // الانتقال للخانة التالية
      if (index < length - 1 && numericText) {
        inputRefs.current[index + 1]?.focus();
        setFocusedIndex(index + 1);
      }
    } else {
      // حذف
      const newPin = value.split('');
      newPin[index] = '';
      onChange(newPin.join(''));
      
      // الانتقال للخانة السابقة
      if (index > 0) {
        inputRefs.current[index - 1]?.focus();
        setFocusedIndex(index - 1);
      }
    }
  }, [value, length, onChange]);

  const handleKeyPress = useCallback((e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !value[index] && index > 0) {
      // إذا كانت الخانة فارغة والضغط على Backspace، انتقل للخانة السابقة
      inputRefs.current[index - 1]?.focus();
      setFocusedIndex(index - 1);
    }
  }, [value]);

  const handleFocus = useCallback((index: number) => {
    setFocusedIndex(index);
  }, []);

  const handleBlur = useCallback(() => {
    setFocusedIndex(null);
  }, []);

  const styles = getStyles(error);

  return (
    <View style={styles.container}>
      {Array.from({ length }).map((_, index) => (
        <TextInput
          key={index}
          ref={(ref) => {
            inputRefs.current[index] = ref;
          }}
          style={[
            styles.input,
            focusedIndex === index && styles.inputFocused,
            error && styles.inputError,
          ]}
          value={value[index] || ''}
          onChangeText={(text) => handleChange(text, index)}
          onKeyPress={(e) => handleKeyPress(e, index)}
          onFocus={() => handleFocus(index)}
          onBlur={handleBlur}
          keyboardType="number-pad"
          maxLength={1}
          selectTextOnFocus
          editable={!disabled}
          autoFocus={autoFocus && index === 0}
          inputMode="numeric"
          textAlign="center"
        />
      ))}
    </View>
  );
}

const getStyles = (error: boolean) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: responsive.isTablet() ? 16 : 12,
    marginVertical: responsive.getResponsivePadding(),
  },
  input: {
    width: responsive.isTablet() ? 56 : responsive.isSmallScreen() ? 44 : 48,
    height: responsive.isTablet() ? 56 : responsive.isSmallScreen() ? 44 : 48,
    borderRadius: responsive.isTablet() ? 16 : 12,
    borderWidth: 2,
    borderColor: error ? '#FF3B30' : '#e0e0e0',
    backgroundColor: '#fff',
    fontSize: responsive.getResponsiveFontSize(24),
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#1a1a1a',
  },
  inputFocused: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F7FF',
  },
  inputError: {
    borderColor: '#FF3B30',
    backgroundColor: '#FFEBEE',
  },
});

