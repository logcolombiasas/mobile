import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { formatPlate } from '../plates/plateParser';

export function Button({ title, onPress, variant = 'primary', loading, disabled, style }: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'danger' | 'secondary' | 'success';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg = { primary: colors.primary, danger: colors.danger, success: colors.success, secondary: '#e2e8f0' }[variant];
  const fg = variant === 'secondary' ? colors.text : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function TextField({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />
    </View>
  );
}

export function PlateBadge({ plate, size = 'md' }: { plate: string; size?: 'sm' | 'md' | 'lg' }) {
  const fontSize = { sm: 14, md: 20, lg: 40 }[size];
  return (
    <View style={[styles.plate, size === 'lg' && { paddingHorizontal: 22, paddingVertical: 8, borderWidth: 4 }]}>
      <Text style={[styles.plateText, { fontSize }]}>{formatPlate(plate)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  input: {
    height: 50, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, fontSize: 16, color: colors.text, backgroundColor: '#fff',
  },
  plate: {
    alignSelf: 'flex-start', backgroundColor: colors.plate, borderColor: '#111', borderWidth: 2,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 2,
  },
  plateText: { fontWeight: '900', color: '#111', letterSpacing: 2, fontVariant: ['tabular-nums'] },
});
