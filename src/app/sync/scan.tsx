import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { applyFamilyCode } from '@/components/familyCode';
import { Button, colors, EmptyState, styles } from '@/components/ui';

/** Scans a family member's sync code. */
export default function ScanFamilyCodeScreen() {
  const { deviceName = '' } = useLocalSearchParams<{ deviceName?: string }>();
  const db = useSQLiteContext();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const handled = useRef(false);

  async function onScan(data: string) {
    if (handled.current) return;
    handled.current = true;
    setBusy(true);
    const message = await applyFamilyCode(db, data, deviceName);
    if (message === null) {
      handled.current = false;
      setBusy(false);
      return;
    }
    Alert.alert('Family sync', message, [{ text: 'OK', onPress: () => router.back() }]);
  }

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <>
        <Stack.Screen options={{ title: 'Scan family code' }} />
        <EmptyState icon="camera-outline" title="Camera needed" message="Allow the camera to scan the QR code on a family member’s phone.">
          <Button title="Allow camera" icon="camera-outline" onPress={requestPermission} />
        </EmptyState>
      </>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: '#000000' }]}>
      <Stack.Screen options={{ title: 'Scan family code' }} />
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={busy ? undefined : (r) => onScan(r.data)}
      />
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 40, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, padding: 14 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 15, textAlign: 'center' }}>
          {busy ? 'Adding…' : 'Point at the QR code on Family sync in their app.'}
        </Text>
      </View>
      {busy ? null : <View style={{ position: 'absolute', top: '30%', alignSelf: 'center', width: 220, height: 220, borderWidth: 3, borderColor: colors.onPrimary, borderRadius: 16 }} />}
    </View>
  );
}
