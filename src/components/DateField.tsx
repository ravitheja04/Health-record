import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { Button, colors, Icon, styles } from './ui';
import { dateToIso, indianToIso, isoToDate, isoToIndian, isValidDate, maskIndianDate } from '@/lib/format';

type Props = {
  label: string;
  /** An ISO date (YYYY-MM-DD) once complete; while typing, the partial DD/MM/YYYY text. */
  value: string | null;
  onChange: (value: string | null) => void;
  hint?: string;
  /** Opens the calendar on the year list first, quicker for birth dates. */
  pickYearFirst?: boolean;
  allowFuture?: boolean;
};

/**
 * A date in Indian DD/MM/YYYY format: type it, or tap the calendar to pick it.
 * The value handed back is always ISO (YYYY-MM-DD) once it is a real date.
 */
export function DateField({ label, value, onChange, hint, pickYearFirst, allowFuture = true }: Props) {
  const [iosOpen, setIosOpen] = useState(false);
  const [iosDraft, setIosDraft] = useState<Date>(new Date());

  const text = isoToIndian(value);
  const complete = !!value && isValidDate(value);
  const looksFinished = !!value && !complete && value.replace(/\D/g, '').length === 8;
  const maximumDate = allowFuture ? undefined : new Date();
  const initial = complete ? isoToDate(value!) : pickYearFirst ? new Date(1990, 0, 1) : new Date();

  function onType(t: string) {
    const masked = maskIndianDate(t);
    onChange(indianToIso(masked) ?? (masked || null));
  }

  function openPicker() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initial,
        mode: 'date',
        maximumDate,
        startOnYearSelection: pickYearFirst && !complete,
        onValueChange: (_e, date) => onChange(dateToIso(date)),
      });
    } else {
      setIosDraft(initial);
      setIosOpen(true);
    }
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={text}
          onChangeText={onType}
          placeholder="DD/MM/YYYY"
          placeholderTextColor="#94A3B8"
          keyboardType="number-pad"
          maxLength={10}
          accessibilityLabel={`${label}, day month year`}
          style={[styles.input, { flex: 1 }, looksFinished && { borderColor: colors.danger }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Pick ${label.toLowerCase()} from a calendar`}
          onPress={openPicker}
          style={({ pressed }) => [
            {
              width: 48,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            },
            pressed && styles.pressed,
          ]}>
          <Icon name="calendar-outline" color={colors.primary} size={22} />
        </Pressable>
      </View>
      {looksFinished ? (
        <Text style={[styles.hint, { color: colors.danger }]}>That date doesn’t exist. Check the day and month.</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)' }} onPress={() => setIosOpen(false)} />
          <View style={{ backgroundColor: colors.card, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 8 }}>
            <DateTimePicker
              value={iosDraft}
              mode="date"
              display="spinner"
              locale="en-IN"
              maximumDate={maximumDate}
              onValueChange={(_e, date) => setIosDraft(date)}
            />
            <Button
              title="Done"
              onPress={() => {
                onChange(dateToIso(iosDraft));
                setIosOpen(false);
              }}
            />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
