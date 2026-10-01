import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';

import { Button, colors, styles } from './ui';
import { toTime } from '@/lib/medSchedule';

function timeToDate(time: string) {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/** A button that opens the phone's clock picker and returns "HH:MM". */
export function AddTimeButton({ onPick, initial = '08:00', label = '+ Add time' }: {
  onPick: (time: string) => void;
  initial?: string;
  label?: string;
}) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(timeToDate(initial));

  function open() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: timeToDate(initial),
        mode: 'time',
        is24Hour: false,
        onValueChange: (_e, date) => onPick(toTime(date.getHours(), date.getMinutes())),
      });
    } else {
      setDraft(timeToDate(initial));
      setIosOpen(true);
    }
  }

  return (
    <>
      <Pressable accessibilityRole="button" onPress={open} style={[styles.chip, { borderStyle: 'dashed', borderColor: colors.primary }]}>
        <Text style={[styles.chipText, { color: colors.primary, fontWeight: '600' }]}>{label}</Text>
      </Pressable>
      {Platform.OS === 'ios' ? (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)' }} onPress={() => setIosOpen(false)} />
          <View style={{ backgroundColor: colors.card, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 8 }}>
            <DateTimePicker
              value={draft}
              mode="time"
              display="spinner"
              locale="en-IN"
              onValueChange={(_e, date) => setDraft(date)}
            />
            <Button
              title="Add"
              onPress={() => {
                onPick(toTime(draft.getHours(), draft.getMinutes()));
                setIosOpen(false);
              }}
            />
          </View>
        </Modal>
      ) : null}
    </>
  );
}
