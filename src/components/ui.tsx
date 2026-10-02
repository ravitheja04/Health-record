import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { initials } from '@/lib/format';

const light = {
  bg: '#F4F7FB',
  card: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  label: '#334155',
  border: '#E2E8F0',
  /** Dividers inside cards, segmented-control tracks. */
  subtle: '#F1F5F9',
  placeholder: '#94A3B8',
  primary: '#2563EB',
  primarySoft: '#DBEAFE',
  onPrimary: '#FFFFFF',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  dangerText: '#991B1B',
  dangerBorder: '#FECACA',
  /** Out-of-range values and "check this" notes. */
  warnText: '#9A3412',
  warnStrong: '#C2410C',
  warnBg: '#FFF7ED',
  warnBorder: '#FDBA74',
  cautionText: '#92400E',
  cautionBg: '#FFFBEB',
  cautionBorder: '#FDE68A',
  okText: '#166534',
  okBg: '#DCFCE7',
  infoText: '#1E40AF',
  infoBg: '#EFF6FF',
  infoBorder: '#93C5FD',
};

export type Palette = typeof light;

const dark: Palette = {
  bg: '#0B1220',
  card: '#131C2E',
  text: '#E5E7EB',
  muted: '#94A3B8',
  label: '#CBD5E1',
  border: '#26324A',
  subtle: '#1C2638',
  placeholder: '#64748B',
  primary: '#3B82F6',
  primarySoft: '#1B2F52',
  onPrimary: '#FFFFFF',
  danger: '#F87171',
  dangerSoft: '#3A1418',
  dangerText: '#FCA5A5',
  dangerBorder: '#7F1D1D',
  warnText: '#FDBA74',
  warnStrong: '#FB923C',
  warnBg: '#2B1A0C',
  warnBorder: '#7C2D12',
  cautionText: '#FDE68A',
  cautionBg: '#2A2309',
  cautionBorder: '#78350F',
  okText: '#86EFAC',
  okBg: '#0F2A1B',
  infoText: '#93C5FD',
  infoBg: '#0F1F3A',
  infoBorder: '#1E40AF',
};

/**
 * The current palette. It is swapped in place when the theme changes (see
 * lib/theme.ts), and the app re-renders, so screens read `colors.x` and
 * `styles.x` at render time and pick up the new values.
 */
export const colors: Palette = { ...light };

export function paletteFor(scheme: 'light' | 'dark') {
  return scheme === 'dark' ? dark : light;
}

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color = colors.text }: { name: string; size?: number; color?: string }) {
  return <Ionicons name={name as IconName} size={size} color={color} />;
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, icon, variant = 'primary', loading, disabled, style }: ButtonProps) {
  const fg = variant === 'primary' ? colors.onPrimary : variant === 'danger' ? colors.danger : colors.primary;
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.dangerSoft : colors.primarySoft;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }, pressed && styles.pressed, style]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} color={fg} size={18} /> : null}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.placeholder}
        {...props}
        style={[styles.input, props.multiline && styles.inputMultiline, props.style]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function ChipSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  renderLabel,
}: {
  label?: string;
  options: readonly T[];
  value: T | null;
  onChange: (value: T | null) => void;
  renderLabel?: (value: T) => string;
}) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.chips}>
        {options.map((opt) => {
          const selected = opt === value;
          return (
            <Pressable key={opt} onPress={() => onChange(selected ? null : opt)} style={[styles.chip, selected && styles.chipSelected]}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{renderLabel ? renderLabel(opt) : opt}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Avatar({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
      ]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

export function EmptyState({ icon, title, message, children }: { icon: string; title: string; message: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={44} color={colors.muted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {children}
    </View>
  );
}

export function InfoRow({ icon, label, value }: { icon: string; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Icon name={icon} size={18} color={colors.muted} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} selectable>
        {value}
      </Text>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 12 },
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    pressed: { opacity: 0.7 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { fontSize: 16, fontWeight: '600', color: c.text },
    subtitle: { fontSize: 13, color: c.muted, marginTop: 2 },
    body: { fontSize: 15, color: c.text, lineHeight: 21 },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 13,
      paddingHorizontal: 16,
      borderRadius: 12,
      minHeight: 48,
    },
    buttonText: { fontSize: 15, fontWeight: '600' },
    field: { gap: 6 },
    label: { fontSize: 13, fontWeight: '600', color: c.label },
    hint: { fontSize: 12, color: c.muted },
    input: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 15,
      color: c.text,
    },
    inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    chipSelected: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 13, color: c.text },
    chipTextSelected: { color: c.onPrimary, fontWeight: '600' },
    avatar: { alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#FFFFFF', fontWeight: '700' },
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: c.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    empty: { alignItems: 'center', padding: 32, gap: 8 },
    emptyTitle: { fontSize: 17, fontWeight: '600', color: c.text },
    emptyMessage: {
      fontSize: 14,
      color: c.muted,
      textAlign: 'center',
      marginBottom: 8,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 6,
    },
    infoLabel: { width: 110, fontSize: 14, color: c.muted },
    infoValue: { flex: 1, fontSize: 14, color: c.text, fontWeight: '500' },
  });
}

export const styles = makeStyles(colors);

/** Swaps the palette and rebuilds the shared styles in place. */
export function applyPalette(scheme: 'light' | 'dark') {
  Object.assign(colors, paletteFor(scheme));
  Object.assign(styles, makeStyles(colors));
}
