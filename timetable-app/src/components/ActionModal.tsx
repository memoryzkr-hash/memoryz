import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '../theme';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 삭제·나가기 확인 모달 */
export function ActionModal({ visible, title, message, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.root}>
        <View style={styles.card} accessibilityRole="alert">
          <View style={styles.header}>
            <Text variant="headingMd" style={styles.title}>
              {title}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onCancel} style={styles.close}>
              <Icon name="x" />
            </Pressable>
          </View>
          <Text variant="bodyLgRegular" color={colors.textSecondary}>
            {message}
          </Text>
          <View style={styles.footer}>
            <Button label="취소" kind="secondary" height={48} onPress={onCancel} style={styles.button} />
            <Button label={confirmLabel} kind="danger" height={48} onPress={onConfirm} style={styles.button} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dim, padding: 22 },
  card: {
    width: '100%',
    maxWidth: 346,
    backgroundColor: colors.bgPrimary,
    borderRadius: radius.lg,
    padding: 24,
    gap: 16,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  title: { flex: 1, paddingVertical: 6 },
  close: { padding: 8, borderRadius: radius.lg },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingTop: 12 },
  button: { width: 100, paddingHorizontal: 0 },
});
