import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openPlannerSession, PlannerError, type PlannerSession } from '../ai/agent';
import { AppBar } from '../components/AppBar';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { Text } from '../components/Text';
import { DAY_LABELS, formatWeekRange, fromKey, weekDates } from '../date';
import { formatRange } from '../planner';
import { colors, radius, type as typeScale } from '../theme';
import type { DateKey, PlannerState, Schedule } from '../types';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  added?: Schedule[];
  deleted?: Schedule[];
  error?: boolean;
}

interface Props {
  state: PlannerState;
  setState: (s: PlannerState) => void;
  weekOf: DateKey;
  onBack: () => void;
  onManual: () => void;
  onShowWeek: () => void;
}

const SUGGESTIONS = [
  '면역학 복습 4시간, 약물학 과제 3시간 넣어줘',
  '평일 저녁마다 2시간씩 자습 시간 잡아줘',
  '금요일 시험 대비 계획 세워줘',
];

let nextId = 1;

/** 계획 세우기: AI와 대화하면 빈 시간에 공부 일정을 넣어 준다 */
export function AiPlanScreen({ state, setState, weekOf, onBack, onManual, onShowWeek }: Props) {
  const [session, setSession] = useState<PlannerSession | null | undefined>(undefined);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState('');
  const stateRef = useRef(state);
  const ctl = useRef<AbortController | null>(null);
  const scroll = useRef<ScrollView>(null);
  stateRef.current = state;

  useEffect(() => {
    let alive = true;
    openPlannerSession().then((s) => alive && setSession(s));
    return () => {
      alive = false;
      ctl.current?.abort();
    };
  }, []);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || busy || !session) return;
    setDraft('');
    setMessages((m) => [...m, { id: nextId++, role: 'user', text: msg }]);
    setBusy(true);
    setStreaming('');
    ctl.current = new AbortController();
    try {
      const r = await session.send(msg, {
        getState: () => stateRef.current,
        setState: (s) => {
          stateRef.current = s;
          setState(s);
        },
        weekOf,
        signal: ctl.current.signal,
        onText: setStreaming,
      });
      setMessages((m) => [...m, { id: nextId++, role: 'assistant', text: r.text || '일정을 정리했어요.', added: r.added, deleted: r.deleted }]);
    } catch (e) {
      const stopped = e instanceof Error && e.name === 'AbortError';
      const text = stopped ? '중단했어요.' : e instanceof PlannerError ? e.message : '문제가 생겼어요. 다시 시도해 주세요.';
      setMessages((m) => [...m, { id: nextId++, role: 'assistant', text, error: !stopped }]);
    } finally {
      setBusy(false);
      setStreaming('');
    }
  };

  const week = weekDates(weekOf);
  const dateOf = (s: Schedule) => s.date ?? week[s.day];
  const describe = (s: Schedule) => {
    const d = fromKey(dateOf(s));
    return `${DAY_LABELS[s.day]} ${d.getMonth() + 1}.${d.getDate()} ${formatRange(s)}`;
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <AppBar title="AI 계획 세우기" onBack={onBack} />
      <View style={styles.weekRow}>
        <Text variant="bodyMdMedium" color={colors.textTertiary}>
          {formatWeekRange(weekOf)}
        </Text>
        <Chip label="직접 고르기" onPress={onManual} />
      </View>

      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} style={styles.root} contentContainerStyle={styles.list} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
          <Bubble role="assistant">
            이번 주 고정 일정을 피해서 빈 시간에 공부 일정을 넣어 드릴게요. 무엇을 얼마나 공부할지 알려 주세요. 넣은 일정은 하루·주간 일정에 바로
            보여요.
          </Bubble>
          {session === null && (
            <View style={styles.notice}>
              <Text variant="bodyMdSemibold" color={colors.textSecondary}>
                AI가 연결되어 있지 않아요
              </Text>
              <Text variant="bodyMdRegular" color={colors.textQuaternary}>
                timetable-app/.env 에 EXPO_PUBLIC_PLANNER_API_URL(AI 서버 주소)을 넣고 앱을 다시 켜 주세요. 자세한 방법은 README의 "AI 계획 세우기" 부분에 있어요.
              </Text>
            </View>
          )}
          {session && !messages.length && (
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Chip key={s} label={s} onPress={() => send(s)} />
              ))}
            </View>
          )}
          {messages.map((m) => (
            <View key={m.id} style={styles.turn}>
              <Bubble role={m.role} error={m.error}>
                {m.text}
              </Bubble>
              {!!(m.added?.length || m.deleted?.length) && (
                <View style={styles.card}>
                  {!!m.added?.length && (
                    <Text variant="bodyMdSemibold" color={colors.textBrandBold}>
                      시간표에 {m.added.length}개 추가했어요
                    </Text>
                  )}
                  {m.added?.map((s) => (
                    <View key={s.id} style={styles.cardRow}>
                      <View style={[styles.dot, { backgroundColor: s.color }]} />
                      <Text variant="bodyMdMedium" color={colors.textSecondary} style={styles.flex} numberOfLines={1}>
                        {s.title}
                      </Text>
                      <Text variant="bodySmRegular" color={colors.textQuaternary}>
                        {describe(s)}
                      </Text>
                    </View>
                  ))}
                  {!!m.deleted?.length && (
                    <Text variant="bodyMdSemibold" color={colors.textTertiary}>
                      {m.deleted.length}개 삭제했어요: {m.deleted.map((s) => s.title).join(', ')}
                    </Text>
                  )}
                  <Button label="주간 일정에서 보기" kind="secondary" height={48} onPress={onShowWeek} />
                </View>
              )}
            </View>
          ))}
          {busy && (
            <View style={styles.turn}>
              <Bubble role="assistant">{streaming || '빈 시간을 보고 계획을 세우는 중이에요…'}</Bubble>
              <View style={styles.busyRow}>
                <ActivityIndicator color={colors.bgBrand} />
                <Pressable accessibilityRole="button" onPress={() => ctl.current?.abort()} hitSlop={8}>
                  <Text variant="bodyMdMedium" color={colors.textQuaternary}>
                    중단
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            accessibilityLabel="AI에게 보낼 메시지"
            value={draft}
            onChangeText={setDraft}
            placeholder={session ? '예: 이번 주 면역학 복습 4시간 넣어줘' : 'AI 연결이 필요해요'}
            placeholderTextColor={colors.textQuinary}
            editable={!!session}
            multiline
            onSubmitEditing={() => send(draft)}
            blurOnSubmit
            style={styles.input}
          />
          <Button label="보내기" height={48} disabled={!session || busy || !draft.trim()} onPress={() => send(draft)} style={styles.sendButton} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ role, error, children }: { role: 'user' | 'assistant'; error?: boolean; children: React.ReactNode }) {
  const mine = role === 'user';
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
      <Text variant="bodyLgRegular" color={error ? colors.bgDanger : mine ? colors.textPrimary : colors.textSecondary}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  flex: { flex: 1 },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.bgSecondary,
  },
  list: { padding: 20, gap: 12 },
  turn: { gap: 8 },
  bubble: { maxWidth: '86%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.bgBrandSubtle, borderBottomRightRadius: radius.md },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.bgTertiary, borderBottomLeftRadius: radius.md },
  notice: { gap: 4, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSecondary },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { gap: 10, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSecondary },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: radius.round, borderWidth: 1, borderColor: colors.borderSecondary },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 4 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSecondary,
    backgroundColor: colors.bgPrimary,
  },
  input: {
    ...typeScale.bodyLgRegular,
    flex: 1,
    minWidth: 0,
    maxHeight: 120,
    color: colors.textSecondary,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    outlineStyle: 'none',
  } as object,
  sendButton: { paddingHorizontal: 16 },
});
