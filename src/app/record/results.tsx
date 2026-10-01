import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, colors, Icon, SectionTitle, styles } from '@/components/ui';
import { getRecord } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { formatValue, parseNumber } from '@/lib/labAnalysis';
import { listMemberResults, listResultsForRecord, replaceResultsForRecord, touchRecord } from '@/lib/labs';
import { getTestDef, keyForName, LAB_TESTS, PANELS, searchTests, type LabTestDef, type PanelKey } from '@/lib/labTests';
import { showError } from '@/lib/useQuery';
import type { LabResult, MedicalRecord } from '@/lib/types';

type Row = {
  id: string;
  testKey: string;
  testName: string;
  value: string;
  unit: string;
  low: string;
  high: string;
  createdAt: string;
};

const numText = (n: number | null) => (n === null ? '' : formatValue(n));

export default function ResultsScreen() {
  const { recordId } = useLocalSearchParams<{ recordId: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [record, setRecord] = useState<MedicalRecord | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  /** The member's most recent result per test, used to pre-fill unit and range. */
  const [lastByTest, setLastByTest] = useState<Map<string, LabResult>>(new Map());
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await getRecord(db, recordId);
      if (!r) return;
      setRecord(r);
      const existing = await listResultsForRecord(db, recordId);
      setRows(
        existing.map((e) => ({
          id: e.id,
          testKey: e.testKey,
          testName: e.testName,
          value: formatValue(e.value),
          unit: e.unit,
          low: numText(e.refLow),
          high: numText(e.refHigh),
          createdAt: e.createdAt,
        }))
      );
      const history = await listMemberResults(db, r.memberId);
      const map = new Map<string, LabResult>();
      for (const h of history) if (h.recordId !== recordId) map.set(h.testKey, h);
      setLastByTest(map);
    })().catch((e) => showError('Could not load results', e));
  }, [db, recordId]);

  if (!record) return null;

  function newRow(testKey: string, testName: string, def?: LabTestDef): Row {
    const prev = lastByTest.get(testKey);
    return {
      id: randomUUID(),
      testKey,
      testName,
      value: '',
      unit: prev?.unit ?? def?.unit ?? '',
      low: numText(prev ? prev.refLow : (def?.refLow ?? null)),
      high: numText(prev ? prev.refHigh : (def?.refHigh ?? null)),
      createdAt: new Date().toISOString(),
    };
  }

  function addTest(def: LabTestDef) {
    if (rows.some((r) => r.testKey === def.key)) return;
    setRows((list) => [...list, newRow(def.key, def.name, def)]);
    setQuery('');
  }

  function addCustom(name: string) {
    const clean = name.trim();
    if (!clean) return;
    const key = keyForName(clean);
    if (rows.some((r) => r.testKey === key)) return setQuery('');
    const def = getTestDef(key);
    setRows((list) => [...list, newRow(key, def?.name ?? clean, def)]);
    setQuery('');
  }

  function addPanel(panel: PanelKey) {
    const missing = LAB_TESTS.filter((t) => t.panel === panel && !rows.some((r) => r.testKey === t.key));
    setRows((list) => [...list, ...missing.map((t) => newRow(t.key, t.name, t))]);
  }

  function update(id: string, patch: Partial<Row>) {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function save() {
    if (!record) return;
    const results: LabResult[] = [];
    for (const r of rows) {
      if (!r.value.trim()) continue;
      const value = parseNumber(r.value);
      if (value === null) return Alert.alert('Check the value', `“${r.value}” for ${r.testName} is not a number.`);
      const low = r.low.trim() ? parseNumber(r.low) : null;
      const high = r.high.trim() ? parseNumber(r.high) : null;
      if ((r.low.trim() && low === null) || (r.high.trim() && high === null)) {
        return Alert.alert('Check the range', `The normal range for ${r.testName} must be numbers.`);
      }
      if (low !== null && high !== null && low > high) {
        return Alert.alert('Check the range', `For ${r.testName} the low end is above the high end.`);
      }
      results.push({
        id: r.id,
        recordId: record.id,
        testKey: r.testKey,
        testName: r.testName,
        value,
        unit: r.unit.trim(),
        refLow: low,
        refHigh: high,
        createdAt: r.createdAt,
      });
    }
    setSaving(true);
    try {
      await db.withTransactionAsync(async () => {
        await replaceResultsForRecord(db, record.id, results);
        await touchRecord(db, record.id);
      });
      router.back();
    } catch (e) {
      showError('Could not save results', e);
      setSaving(false);
    }
  }

  const matches = searchTests(query).filter((t) => !rows.some((r) => r.testKey === t.key));
  const emptyCount = rows.filter((r) => !r.value.trim()).length;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Test results' }} />
      <ScrollView
        style={styles.screen}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.subtitle}>
          {record.title} · {formatDate(record.date)}
        </Text>
        <Text style={[styles.subtitle, { marginTop: 0 }]}>
          Copy each value and the normal range exactly as printed on the report. Ranges are pre-filled from this person’s last
          report or typical values, so check them.
        </Text>

        {rows.map((r) => (
          <Card key={r.id} style={{ gap: 10 }}>
            <View style={[styles.row, { gap: 8 }]}>
              <Text style={[styles.title, { flex: 1 }]}>{r.testName}</Text>
              <Pressable
                accessibilityLabel={`Remove ${r.testName}`}
                hitSlop={10}
                onPress={() => setRows((list) => list.filter((x) => x.id !== r.id))}>
                <Icon name="close-outline" color={colors.muted} size={22} />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1.2 }}>
                <Text style={styles.label}>Value</Text>
                <TextInput
                  value={r.value}
                  onChangeText={(v) => update(r.id, { value: v })}
                  keyboardType="decimal-pad"
                  placeholder="—"
                  placeholderTextColor="#94A3B8"
                  accessibilityLabel={`${r.testName} value`}
                  style={[styles.input, { marginTop: 4, fontWeight: '700' }]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Unit</Text>
                <TextInput
                  value={r.unit}
                  onChangeText={(v) => update(r.id, { unit: v })}
                  autoCapitalize="none"
                  placeholder="unit"
                  placeholderTextColor="#94A3B8"
                  accessibilityLabel={`${r.testName} unit`}
                  style={[styles.input, { marginTop: 4 }]}
                />
              </View>
            </View>
            <View>
              <Text style={styles.label}>Normal range on report</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <TextInput
                  value={r.low}
                  onChangeText={(v) => update(r.id, { low: v })}
                  keyboardType="decimal-pad"
                  placeholder="low"
                  placeholderTextColor="#94A3B8"
                  accessibilityLabel={`${r.testName} range low`}
                  style={[styles.input, { flex: 1 }]}
                />
                <Text style={styles.subtitle}>to</Text>
                <TextInput
                  value={r.high}
                  onChangeText={(v) => update(r.id, { high: v })}
                  keyboardType="decimal-pad"
                  placeholder="high"
                  placeholderTextColor="#94A3B8"
                  accessibilityLabel={`${r.testName} range high`}
                  style={[styles.input, { flex: 1 }]}
                />
              </View>
            </View>
          </Card>
        ))}

        <SectionTitle>Add tests</SectionTitle>
        <View style={styles.chips}>
          {PANELS.filter((p) => p.key !== 'other').map((p) => (
            <Pressable key={p.key} onPress={() => addPanel(p.key)} style={styles.chip} accessibilityRole="button">
              <Text style={styles.chipText}>+ {p.label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search a test, e.g. HbA1c, TSH, vitamin D"
          placeholderTextColor="#94A3B8"
          returnKeyType="done"
          onSubmitEditing={() => (matches[0] ? addTest(matches[0]) : addCustom(query))}
          style={styles.input}
        />
        {query.trim() ? (
          <Card style={{ paddingVertical: 4 }}>
            {matches.map((t) => (
              <Pressable key={t.key} onPress={() => addTest(t)} style={{ paddingVertical: 10 }}>
                <Text style={styles.body}>{t.name}</Text>
                <Text style={[styles.subtitle, { marginTop: 0 }]}>{PANELS.find((p) => p.key === t.panel)?.label}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => addCustom(query)} style={{ paddingVertical: 10 }}>
              <Text style={[styles.body, { color: colors.primary, fontWeight: '600' }]}>+ Add “{query.trim()}” as a new test</Text>
            </Pressable>
          </Card>
        ) : null}

        <Button
          title={rows.length ? 'Save results' : 'Save'}
          icon="checkmark"
          onPress={save}
          loading={saving}
          style={{ marginTop: 8 }}
        />
        {emptyCount > 0 ? (
          <Text style={[styles.subtitle, { textAlign: 'center' }]}>
            {emptyCount} test{emptyCount === 1 ? '' : 's'} without a value will be skipped.
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
