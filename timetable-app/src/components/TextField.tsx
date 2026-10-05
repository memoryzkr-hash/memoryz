import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, radius, type as typeScale } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

interface Props {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  /** 비어 있을 때 오른쪽에 돋보기를 보여준다 */
  searchIcon?: boolean;
  onSubmitEditing?: () => void;
}

export function TextField({ label, value, onChangeText, placeholder, searchIcon, onSubmitEditing }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.area}>
      <Text variant="bodyMdMedium" color={colors.textSecondary}>
        {label}
      </Text>
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textQuinary}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          returnKeyType="done"
          style={styles.input}
        />
        {value ? (
          <Pressable accessibilityRole="button" accessibilityLabel="지우기" onPress={() => onChangeText('')} hitSlop={8}>
            <Icon name="cancel-circle" />
          </Pressable>
        ) : (
          searchIcon && <Icon name="search" />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  area: { gap: 8 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    borderRadius: radius.lg,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  fieldFocused: { borderColor: colors.textQuaternary },
  input: { ...typeScale.bodyLgRegular, flex: 1, minWidth: 0, color: colors.textSecondary, padding: 0, outlineStyle: 'none' } as object,
});
