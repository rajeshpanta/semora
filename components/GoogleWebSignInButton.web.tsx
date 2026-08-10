import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { mountGoogleWebSignInButton } from '@/lib/googleWebAuth';

export interface GoogleWebSignInButtonProps {
  disabled?: boolean;
  theme?: 'outline' | 'filled_black';
  shape?: 'pill' | 'rectangular';
  text?: 'continue_with' | 'signin_with' | 'signup_with';
  onProcessingChange?: (processing: boolean) => void;
  onSuccess: () => void;
  onError: (error: Error) => void;
}

export function GoogleWebSignInButton({
  disabled = false,
  theme = 'filled_black',
  shape = 'rectangular',
  text = 'continue_with',
  onProcessingChange,
  onSuccess,
  onError,
}: GoogleWebSignInButtonProps) {
  const hostRef = useRef<HTMLElement | null>(null);
  const callbacksRef = useRef({ onProcessingChange, onSuccess, onError });
  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);

  callbacksRef.current = { onProcessingChange, onSuccess, onError };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    return mountGoogleWebSignInButton(host, {
      onReady: () => setReady(true),
      onProcessingChange: (nextProcessing) => {
        setProcessing(nextProcessing);
        callbacksRef.current.onProcessingChange?.(nextProcessing);
      },
      onSuccess: () => callbacksRef.current.onSuccess(),
      onError: (error) => callbacksRef.current.onError(error),
    }, { theme, shape, text });
  }, [shape, text, theme]);

  return (
    <View
      style={[styles.container, disabled && styles.disabled]}
      pointerEvents={disabled || processing ? 'none' : 'auto'}
    >
      <View
        ref={(node) => { hostRef.current = node as unknown as HTMLElement | null; }}
        style={styles.host}
      />
      {!ready || processing ? (
        <View
          pointerEvents="none"
          style={[
            styles.activity,
            shape === 'rectangular' ? styles.activityRectangular : styles.activityPill,
            theme === 'filled_black' && styles.activityDark,
          ]}
        >
          <ActivityIndicator color={theme === 'filled_black' ? '#fff' : '#1f1f1f'} size="small" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  host: {
    width: '100%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activity: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderColor: '#dadce0',
    borderWidth: 1,
  },
  activityRectangular: {
    borderRadius: 4,
  },
  activityPill: {
    borderRadius: 20,
  },
  activityDark: {
    backgroundColor: '#111',
    borderColor: 'rgba(255,255,255,0.14)',
  },
});
