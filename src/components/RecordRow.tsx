import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Card, colors, Icon, styles } from './ui';
import type { RecordWithCount } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { RECORD_TYPES } from '@/lib/types';

export function RecordRow({ record, showMember }: { record: RecordWithCount; showMember?: boolean }) {
  const type = RECORD_TYPES[record.type] ?? RECORD_TYPES.other;
  const meta = [formatDate(record.date), showMember ? record.memberName : type.label, record.facility || record.doctor]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card onPress={() => router.push({ pathname: '/record/[id]', params: { id: record.id } })}>
      <View style={styles.row}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: `${type.color}1A`,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon name={type.icon} color={type.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {record.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        {record.attachmentCount > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Icon name="attach-outline" size={16} color={colors.muted} />
            <Text style={styles.subtitle}>{record.attachmentCount}</Text>
          </View>
        ) : null}
        <Icon name="chevron-forward-outline" size={18} color={colors.muted} />
      </View>
    </Card>
  );
}
