import React, { forwardRef, type ReactNode } from 'react';
import {
  Alert as NativeAlert,
  Pressable as NativePressable,
  Switch as NativeSwitch,
  Text as NativeText,
  TextInput as NativeTextInput,
  TouchableOpacity as NativeTouchableOpacity,
  type AlertButton,
  type AlertOptions,
  type TextInputProps,
  type TextProps,
} from 'react-native';
import { translate, useI18n } from '@/lib/i18n';

function localizedChildren(children: ReactNode, locale: 'en' | 'es'): ReactNode {
  if (typeof children === 'string') return translate(children, locale);
  if (Array.isArray(children)) {
    if (children.every((child) => typeof child === 'string' || typeof child === 'number')) {
      return translate(children.join(''), locale);
    }
    return children.map((child, index) => (
      typeof child === 'string' ? <React.Fragment key={index}>{translate(child, locale)}</React.Fragment> : child
    ));
  }
  return children;
}

export const Text = forwardRef<React.ElementRef<typeof NativeText>, TextProps>(function LocalizedText(
  { children, accessibilityLabel, ...props },
  ref,
) {
  const { locale } = useI18n();
  return (
    <NativeText
      ref={ref}
      accessibilityLabel={accessibilityLabel ? translate(accessibilityLabel, locale) : accessibilityLabel}
      {...props}
    >
      {localizedChildren(children, locale)}
    </NativeText>
  );
});

export const TextInput = forwardRef<React.ElementRef<typeof NativeTextInput>, TextInputProps>(function LocalizedTextInput(
  { placeholder, accessibilityLabel, ...props },
  ref,
) {
  const { locale } = useI18n();
  return (
    <NativeTextInput
      ref={ref}
      placeholder={placeholder ? translate(placeholder, locale) : placeholder}
      accessibilityLabel={accessibilityLabel ? translate(accessibilityLabel, locale) : accessibilityLabel}
      {...props}
    />
  );
});

export const Pressable = forwardRef<React.ElementRef<typeof NativePressable>, React.ComponentProps<typeof NativePressable>>(
  function LocalizedPressable({ accessibilityLabel, ...props }, ref) {
    const { locale } = useI18n();
    return <NativePressable ref={ref} accessibilityLabel={accessibilityLabel ? translate(accessibilityLabel, locale) : accessibilityLabel} {...props} />;
  },
);

export const TouchableOpacity = forwardRef<React.ElementRef<typeof NativeTouchableOpacity>, React.ComponentProps<typeof NativeTouchableOpacity>>(
  function LocalizedTouchableOpacity({ accessibilityLabel, ...props }, ref) {
    const { locale } = useI18n();
    return <NativeTouchableOpacity ref={ref} accessibilityLabel={accessibilityLabel ? translate(accessibilityLabel, locale) : accessibilityLabel} {...props} />;
  },
);

export const Switch = forwardRef<React.ElementRef<typeof NativeSwitch>, React.ComponentProps<typeof NativeSwitch>>(
  function LocalizedSwitch({ accessibilityLabel, ...props }, ref) {
    const { locale } = useI18n();
    return <NativeSwitch ref={ref} accessibilityLabel={accessibilityLabel ? translate(accessibilityLabel, locale) : accessibilityLabel} {...props} />;
  },
);

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    const localizedButtons = buttons?.map((button) => ({
      ...button,
      text: button.text ? translate(button.text) : button.text,
    }));
    NativeAlert.alert(translate(title), message ? translate(message) : message, localizedButtons, options);
  },
};
