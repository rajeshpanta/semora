export interface GoogleWebSignInButtonProps {
  disabled?: boolean;
  theme?: 'outline' | 'filled_black';
  shape?: 'pill' | 'rectangular';
  onProcessingChange?: (processing: boolean) => void;
  onSuccess: () => void;
  onError: (error: Error) => void;
}

/** Metro replaces this native guard with GoogleWebSignInButton.web.tsx on web. */
export function GoogleWebSignInButton(_props: GoogleWebSignInButtonProps) {
  return null;
}
