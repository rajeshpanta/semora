import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AlertButton,
  type AlertOptions,
} from 'react-native';
import { useColors } from '@/lib/theme';

type AlertPayload = {
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
};

let activeAlert: AlertPayload | null = null;
const listeners = new Set<(payload: AlertPayload | null) => void>();

function publish(payload: AlertPayload | null) {
  activeAlert = payload;
  listeners.forEach((listener) => listener(payload));
}

// react-native-web intentionally ships Alert.alert as a no-op. Patch that
// shared singleton once so the existing app-wide Alert API keeps working in
// the browser, including multi-button confirmations used by scan and delete
// flows.
if (Platform.OS === 'web') {
  Alert.alert = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions,
  ) => {
    publish({
      title,
      message,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
      options,
    });
  };
}

export function WebAlertHost() {
  const colors = useColors();
  const [payload, setPayload] = useState<AlertPayload | null>(activeAlert);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    listeners.add(setPayload);
    return () => {
      listeners.delete(setPayload);
    };
  }, []);

  if (Platform.OS !== 'web') return null;

  const dismiss = (button?: AlertButton) => {
    if (!payload) return;
    publish(null);
    button?.onPress?.();
  };

  const cancelButton = payload?.buttons.find((button) => button.style === 'cancel');
  const requestClose = () => {
    if (!payload?.options?.cancelable && !cancelButton) return;
    dismiss(cancelButton);
    payload?.options?.onDismiss?.();
  };

  return (
    <Modal
      transparent
      visible={!!payload}
      animationType="fade"
      onRequestClose={requestClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close dialog"
          style={StyleSheet.absoluteFill}
          onPress={requestClose}
        />
        <View
          accessibilityRole="alert"
          style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.line }]}
        >
          <Text style={[styles.title, { color: colors.ink }]}>{payload?.title}</Text>
          {!!payload?.message && (
            <Text style={[styles.message, { color: colors.ink2 }]}>{payload.message}</Text>
          )}
          <View style={styles.actions}>
            {payload?.buttons.map((button, index) => {
              const isPrimary =
                button.style !== 'cancel' &&
                index === payload.buttons.length - 1;
              const isDestructive = button.style === 'destructive';
              return (
                <Pressable
                  key={`${button.text ?? 'OK'}-${index}`}
                  accessibilityRole="button"
                  onPress={() => dismiss(button)}
                  style={({ pressed }) => [
                    styles.button,
                    {
                      backgroundColor: isPrimary
                        ? isDestructive
                          ? colors.coral
                          : colors.brand
                        : colors.paper,
                      borderColor: isPrimary ? 'transparent' : colors.line,
                      opacity: pressed ? 0.76 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      { color: isPrimary ? '#fff' : isDestructive ? colors.coral : colors.ink2 },
                    ]}
                  >
                    {button.text ?? 'OK'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(12, 11, 36, 0.46)',
  },
  dialog: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 22,
    borderWidth: 1,
    padding: 22,
    boxShadow: '0 24px 70px rgba(12, 11, 36, 0.24)',
  } as any,
  title: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '700',
  },
  message: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    marginTop: 22,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 9,
  },
  button: {
    minHeight: 42,
    minWidth: 88,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  } as any,
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
