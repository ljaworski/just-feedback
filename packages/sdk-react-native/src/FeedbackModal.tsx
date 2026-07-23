import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FeedbackContext } from './FeedbackProvider';
import { sendFeedback } from './client';
import type { FeedbackCopy, FeedbackStyles } from './types';

const DEFAULT_COPY: Required<FeedbackCopy> = {
  title: 'Share your feedback',
  placeholder: "Tell us what's on your mind…",
  cta: 'Send',
  cancel: 'Cancel',
  successMessage: 'Thanks! Your feedback was sent.',
  errorMessage: "Couldn't send feedback. Please try again.",
};

export function FeedbackModal(props: {
  visible: boolean;
  onClose: () => void;
  copy?: FeedbackCopy;
  styles?: FeedbackStyles;
}): React.ReactElement {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error('FeedbackModal must be used within a <FeedbackProvider>.');
  }

  // copy/styles: props > provider config > defaults (styles have no textual default).
  const copy = { ...DEFAULT_COPY, ...ctx.config.copy, ...props.copy };
  const styles: FeedbackStyles = { ...ctx.config.styles, ...props.styles };

  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);

  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  // Fresh state each time the modal opens.
  useEffect(() => {
    if (props.visible) {
      setContent('');
      setError(false);
      setSuccess(false);
      setSending(false);
    }
  }, [props.visible]);

  const canSend = content.trim().length > 0 && !sending && !success;

  const handleSend = async (): Promise<void> => {
    if (!canSend) return;
    setSending(true);
    setError(false);
    try {
      await sendFeedback({
        url: ctx.config.url,
        apiKey: ctx.config.apiKey,
        content: content.trim(),
        metadata: ctx.config.metadata,
      });
      if (!mounted.current) return;
      setSending(false);
      setSuccess(true);
      setContent('');
      closeTimer.current = setTimeout(() => {
        if (mounted.current) props.onClose();
      }, 1500);
    } catch {
      if (!mounted.current) return;
      setSending(false);
      setError(true);
    }
  };

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="slide"
      onRequestClose={props.onClose}
    >
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={[s.overlay, styles.overlay]}
          activeOpacity={1}
          onPress={props.onClose}
        >
          <TouchableOpacity
            style={[s.container, styles.container]}
            activeOpacity={1}
            onPress={() => {}}
          >
            {success ? (
              <Text style={[s.title, styles.title]}>
                {'✓ '}
                {copy.successMessage}
              </Text>
            ) : (
              <View>
                <Text style={[s.title, styles.title]}>{copy.title}</Text>
                <TextInput
                  style={[s.input, styles.input]}
                  placeholder={copy.placeholder}
                  placeholderTextColor="#9ca3af"
                  value={content}
                  onChangeText={setContent}
                  multiline
                  numberOfLines={5}
                  maxLength={5000}
                  autoFocus
                  editable={!sending}
                />
                {error ? <Text style={s.error}>{copy.errorMessage}</Text> : null}
                <TouchableOpacity
                  style={[s.cta, styles.ctaButton, !canSend && s.ctaDisabled]}
                  onPress={handleSend}
                  disabled={!canSend}
                >
                  {sending ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={[s.ctaText, styles.ctaButtonText]}>{copy.cta}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={props.onClose} disabled={sending}>
                  <Text style={[s.cancel, styles.cancelText]}>{copy.cancel}</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#1a1a1a',
    textAlignVertical: 'top',
  },
  error: {
    color: '#dc2626',
    marginTop: 8,
    fontSize: 14,
  },
  cta: {
    marginTop: 16,
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancel: {
    marginTop: 12,
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 16,
  },
});
