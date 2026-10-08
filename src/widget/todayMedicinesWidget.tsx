import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { t } from '../i18n';
import type { WidgetModel } from './widgetData';

/** Opens the Medicines tab (the app's URL scheme is set in app.json). */
export const MEDICINES_URI = 'familyhealth://medicines';

type Hex = `#${string}`;
type Palette = { bg: Hex; text: Hex; muted: Hex; line: Hex; primary: Hex; late: Hex; ok: Hex; buttonBg: Hex };

const LIGHT: Palette = {
  bg: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  line: '#F1F5F9',
  primary: '#2563EB',
  late: '#C2410C',
  ok: '#15803D',
  buttonBg: '#DBEAFE',
};
const DARK: Palette = {
  bg: '#131C2E',
  text: '#E5E7EB',
  muted: '#94A3B8',
  line: '#1C2638',
  primary: '#93C5FD',
  late: '#FB923C',
  ok: '#86EFAC',
  buttonBg: '#1B2F52',
};

function Message({ p, text }: { p: Palette; text: string }) {
  return <TextWidget text={text} style={{ fontSize: 13, color: p.muted, marginTop: 6 }} maxLines={3} />;
}

function Body({ model, p }: { model: WidgetModel; p: Palette }) {
  if (model.kind === 'locked') return <Message p={p} text={t('App lock is on. Open the app to see today’s doses.')} />;
  if (model.kind === 'empty') return <Message p={p} text={t('No medicines due today.')} />;
  return (
    <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
      {model.doses.map((d, i) => (
        <FlexWidget
          key={`${d.medicationId}-${d.time}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            width: 'match_parent',
            height: 34,
            borderTopWidth: i ? 1 : 0,
            borderTopColor: p.line,
          }}>
          <TextWidget
            text={d.timeText}
            style={{ fontSize: 12, width: 62, color: d.status === 'late' ? p.late : p.muted, fontWeight: d.status === 'late' ? 'bold' : 'normal' }}
          />
          <FlexWidget style={{ flex: 1 }}>
            <TextWidget
              text={d.title}
              maxLines={1}
              truncate="END"
              style={{ fontSize: 13, color: d.status === 'taken' || d.status === 'skipped' ? p.muted : p.text }}
            />
          </FlexWidget>
          {d.status === 'due' || d.status === 'late' ? (
            <FlexWidget
              clickAction="MARK_TAKEN"
              clickActionData={{ medicationId: d.medicationId, time: d.time }}
              accessibilityLabel={t('Mark {what} at {time} as taken', { what: d.title, time: d.timeText })}
              style={{ backgroundColor: p.buttonBg, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 6 }}>
              <TextWidget text={`✓ ${t('Taken')}`} style={{ fontSize: 12, color: p.primary, fontWeight: 'bold' }} />
            </FlexWidget>
          ) : (
            <TextWidget
              text={d.status === 'taken' ? `✓ ${t('Taken')}` : t('Skipped')}
              style={{ fontSize: 12, color: d.status === 'taken' ? p.ok : p.muted, marginLeft: 6 }}
            />
          )}
        </FlexWidget>
      ))}
      {model.more ? <TextWidget text={t('+{n} more', { n: model.more })} style={{ fontSize: 12, color: p.muted, marginTop: 2 }} /> : null}
    </FlexWidget>
  );
}

function Widget({ model, p }: { model: WidgetModel; p: Palette }) {
  const summary =
    model.kind === 'doses' ? (model.allDone ? t('All done today') : t('{taken} of {total} taken', { taken: model.taken, total: model.total })) : '';
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: MEDICINES_URI }}
      accessibilityLabel={t('Today’s medicines. Opens the Medicines tab.')}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: p.bg, borderRadius: 16, padding: 12, flexDirection: 'column' }}>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', marginBottom: 4 }}>
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget text={t('Today’s medicines')} style={{ fontSize: 15, fontWeight: 'bold', color: p.text }} />
        </FlexWidget>
        {summary ? <TextWidget text={summary} style={{ fontSize: 12, color: model.kind === 'doses' && model.allDone ? p.ok : p.muted }} /> : null}
      </FlexWidget>
      <Body model={model} p={p} />
    </FlexWidget>
  );
}

/** Light and dark versions; Android picks one to match the home screen. */
export function todayMedicinesWidget(model: WidgetModel) {
  return { light: <Widget model={model} p={LIGHT} />, dark: <Widget model={model} p={DARK} /> };
}
