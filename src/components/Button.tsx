import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
}

export default function Button({ title, onPress, variant = 'primary', style, textStyle, disabled = false }: ButtonProps) {
  const getBackgroundColor = () => {
    if (disabled) return Colors.border;
    switch (variant) {
      case 'danger': return Colors.error;
      case 'secondary': return Colors.secondary;
      case 'primary':
      default: return Colors.black;
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.button, 
        { backgroundColor: getBackgroundColor(), opacity: disabled ? 0.6 : 1 }, 
        style
      ]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      activeOpacity={disabled ? 1 : 0.8}
    >
      <Text style={[styles.text, textStyle]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    minHeight: 56, // Large touch target
  },
  text: {
    ...Typography.button,
    color: Colors.white,
  },
});
