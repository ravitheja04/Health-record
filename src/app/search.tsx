import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RecordRow } from '@/components/RecordRow';
import { colors, Icon, styles } from '@/components/ui';
import { searchRecords, type RecordWithCount } from '@/lib/db';

export default function SearchScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RecordWithCount[]>([]);

  useEffect(() => {
    if (!query.trim()) return;
    let active = true;
    const timer = setTimeout(() => {
      searchRecords(db, query).then((r) => active && setResults(r));
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [db, query]);

  return (
    <FlatList
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      data={query.trim() ? results : []}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <RecordRow record={item} showMember />}
      ListHeaderComponent={
        <View style={[styles.input, styles.row, { paddingVertical: 4 }]}>
          <Icon name="search-outline" color={colors.muted} size={18} />
          <TextInput
            style={{ flex: 1, fontSize: 15, paddingVertical: 8, color: colors.text }}
            placeholder="Title, doctor, hospital, notes or name"
            placeholderTextColor="#94A3B8"
            value={query}
            onChangeText={setQuery}
            autoFocus
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
        </View>
      }
      ListEmptyComponent={
        query.trim() ? <Text style={[styles.subtitle, { textAlign: 'center', marginTop: 24 }]}>No matching records.</Text> : null
      }
    />
  );
}
