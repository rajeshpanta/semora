import React, { forwardRef, type ReactNode } from 'react';
import {
  Alert as NativeAlert,
  Platform,
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

    // react-native-web ships `class Alert { static alert() {} }` — a literal
    // no-op. The app puts real work inside alert callbacks (delete a deck,
    // delete a card, publish a deck to a class), so on the web those buttons
    // did nothing at all, and every error and validation message was swallowed
    // in silence. Map onto the browser's own dialogs instead.
    //
    // Handled here rather than in a LocalizedReactNative.web.tsx: on web that
    // filename IS this module, so importing the shared implementation from it
    // resolves to itself and dies with "Cannot access 'Alert' before
    // initialization".
    if (Platform.OS === 'web') {
      const heading = translate(title);
      const body = message ? translate(message) : '';
      const text = [heading, body].filter(Boolean).join('\n\n');
      const list = localizedButtons ?? [];

      if (list.length <= 1) {
        if (typeof window !== 'undefined') window.alert(text);
        list[0]?.onPress?.();
        return;
      }
      // confirm() reads as "OK does the thing", so OK runs the last
      // non-cancel action and Cancel runs the cancel button.
      const actionable = list.filter((b) => b.style !== 'cancel');
      const primary = actionable[actionable.length - 1] ?? list[list.length - 1];
      const cancel = list.find((b) => b.style === 'cancel');
      if (typeof window !== 'undefined' && window.confirm(text)) primary?.onPress?.();
      else cancel?.onPress?.();
      return;
    }

    NativeAlert.alert(translate(title), message ? translate(message) : message, localizedButtons, options);
  },
};
