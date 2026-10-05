import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** 제목 오른쪽 버튼. 기본은 닫기(x) */
  action?: { icon: IconName; label: string; onPress: () => void };
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function BottomSheet({ visible, title, onClose, action, children, footer }: Props) {
  const insets = useSafeAreaInsets();
  const headerAction = action ?? { icon: 'x-32' as const, label: '닫기', onPress: onClose };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="닫기" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
          <View style={styles.handle}>
            <Icon name="drag-handle" width={350} height={20} />
          </View>
          <View style={styles.header}>
            <Text variant="headingMd" style={styles.title}>
              {title}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={headerAction.label} onPress={headerAction.onPress} hitSlop={8}>
              <Icon name={headerAction.icon} size={32} />
            </Pressable>
          </View>
          {children}
          {footer}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.dim },
  sheet: {
    backgroundColor: colors.bgPrimary,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  handle: { height: 20, alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  title: { flex: 1 },
});
