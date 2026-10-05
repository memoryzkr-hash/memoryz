import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { ActionModal } from './src/components/ActionModal';
import { AppBar } from './src/components/AppBar';
import { BottomNav } from './src/components/BottomNav';
import { CalendarSheet } from './src/components/CalendarSheet';
import { ScheduleSheet, type ScheduleDraft } from './src/components/ScheduleSheet';
import { TimetableAddSheet, TimetableListSheet } from './src/components/TimetableSheets';
import { UnderlineTabs } from './src/components/UnderlineTabs';
import { addDays, formatDayTitle, formatWeekRange, toKey, weekDates, weekday } from './src/date';
import {
  buildSchedule,
  occupiedSlots,
  rangeToTimes,
  retimeSchedule,
  scheduleColor,
  schedulesOn,
  studySummary,
  timesToRange,
  toggleSlot,
  type ScheduleSlot,
  type SlotRange,
} from './src/planner';
import { AiPlanScreen } from './src/screens/AiPlanScreen';
import { DayView } from './src/screens/DayView';
import { SlotPickerScreen } from './src/screens/SlotPickerScreen';
import { WeekView } from './src/screens/WeekView';
import { usePlanner } from './src/store';
import { colors, fonts } from './src/theme';
import type { DateKey, Day, Schedule, Timetable } from './src/types';

type Tab = 'day' | 'week';
type Route = 'main' | 'ai' | 'add' | 'plan' | 'changeTime';
type Sheet =
  | { mode: 'add'; draft: ScheduleDraft; slots: ScheduleSlot[] }
  | { mode: 'edit'; schedule: Schedule; draft: ScheduleDraft };

const TABS = [
  { key: 'day', label: '하루' },
  { key: 'week', label: '주간 일정' },
] as const;

const noSelection = (): (SlotRange | null)[] => Array(7).fill(null);

export default function App() {
  const [fontsLoaded] = useFonts({
    [fonts.regular]: require('./assets/fonts/Pretendard-Regular.ttf'),
    [fonts.medium]: require('./assets/fonts/Pretendard-Medium.ttf'),
    [fonts.semibold]: require('./assets/fonts/Pretendard-SemiBold.ttf'),
  });
  const [state, dispatch] = usePlanner();
  const today = toKey(new Date());

  const [tab, setTab] = useState<Tab>('day');
  const [date, setDate] = useState<DateKey>(today);
  const [route, setRoute] = useState<Route>('main');
  const [pickerDate, setPickerDate] = useState<DateKey>(today);
  const [selection, setSelection] = useState(noSelection);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [sheetHidden, setSheetHidden] = useState(false);
  const [calendar, setCalendar] = useState<null | 'main' | 'picker'>(null);
  const [timetableList, setTimetableList] = useState(false);
  const [timetableAdd, setTimetableAdd] = useState(false);
  const [deletingSchedule, setDeletingSchedule] = useState<Schedule | null>(null);
  const [deletingTimetable, setDeletingTimetable] = useState<Timetable | null>(null);
  const [leavingPlan, setLeavingPlan] = useState(false);

  const hasSelection = selection.some(Boolean);
  const editing = sheet?.mode === 'edit' ? sheet.schedule : null;

  // ---- 화면 이동 ----

  const openPicker = (next: Route, at: DateKey, initial = noSelection()) => {
    setPickerDate(at);
    setSelection(initial);
    setRoute(next);
  };

  const backToMain = () => {
    setRoute('main');
    setSelection(noSelection());
    if (sheet) setSheetHidden(false);
  };

  const leavePicker = () => {
    if (route === 'plan' && hasSelection) setLeavingPlan(true);
    else backToMain();
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route === 'main') return false;
      leavePicker();
      return true;
    });
    return () => sub.remove();
  });

  // ---- 칸 선택 ----

  const pickerWeek = weekDates(pickerDate);
  const occupied: (boolean[] | null)[] =
    route === 'add'
      ? pickerWeek.map((d) => (d === pickerDate ? occupiedSlots(schedulesOn(state, d)) : null))
      : pickerWeek.map((d) => occupiedSlots(schedulesOn(state, d), editing?.id));

  const toggle = (day: Day, slot: number) => {
    const taken = occupied[day];
    if (!taken) return;
    setSelection((sel) => {
      // 일정 추가·시간 변경은 하루만, 계획 세우기는 요일마다 하나씩 고를 수 있다
      const base = route === 'plan' ? [...sel] : sel.map((r, d) => (d === day ? r : null));
      base[day] = toggleSlot(base[day], slot, taken);
      return base;
    });
  };

  const selectedSlots = (): ScheduleSlot[] =>
    selection.flatMap((r, d) => (r ? [{ date: pickerWeek[d], ...rangeToTimes(r) }] : []));

  const confirmPicker = () => {
    const slots = selectedSlots();
    if (!slots.length) return;
    if (route === 'changeTime' && sheet?.mode === 'edit') {
      setSheet({ ...sheet, draft: { ...sheet.draft, ...slots[0] } });
      backToMain();
      return;
    }
    setSheet({ mode: 'add', draft: { kind: 'fixed', title: '', ...slots[0] }, slots });
    setSheetHidden(false);
  };

  // ---- 일정 저장 ----

  const submitSheet = (draft: ScheduleDraft) => {
    if (!sheet) return;
    if (sheet.mode === 'add') {
      const color = scheduleColor(draft.kind);
      const created = sheet.slots.map((slot) => buildSchedule(state.activeTimetableId, draft.kind, draft.title, slot, color));
      dispatch({ type: 'addSchedules', schedules: created });
      if (route === 'add') setDate(pickerDate);
      setSheet(null);
      backToMain();
    } else {
      dispatch({ type: 'updateSchedule', schedule: retimeSchedule(sheet.schedule, draft.kind, draft.title, draft) });
      setSheet(null);
    }
  };

  const openEdit = (schedule: Schedule, on: DateKey) => {
    setSheet({
      mode: 'edit',
      schedule,
      draft: { kind: schedule.kind, title: schedule.title, date: on, start: schedule.start, end: schedule.end },
    });
    setSheetHidden(false);
  };

  const changeTime = (draft: ScheduleDraft) => {
    if (sheet?.mode !== 'edit') return;
    setSheet({ ...sheet, draft });
    setSheetHidden(true);
    const initial = noSelection();
    initial[weekday(draft.date)] = timesToRange(draft);
    openPicker('changeTime', draft.date, initial);
  };

  if (!fontsLoaded) return <View style={styles.root} />;

  const pickerProps = {
    add: {
      title: '일정 추가',
      dateLabel: formatDayTitle(pickerDate),
      step: 1,
      confirmLabel: '일정 추가',
    },
    plan: { title: '시간표 계획 세우기', dateLabel: formatWeekRange(pickerDate), step: 7, confirmLabel: '일정 추가' },
    changeTime: { title: '시간 변경', dateLabel: formatWeekRange(pickerDate), step: 7, confirmLabel: '시간 변경' },
  } as const;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {route === 'main' ? (
        <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
          <AppBar title="시간표" />
          <UnderlineTabs tabs={TABS} value={tab} onChange={setTab} />
          {tab === 'day' ? (
            <DayView
              state={state}
              date={date}
              onChangeDate={setDate}
              onOpenCalendar={() => setCalendar('main')}
              onToggleDone={(id) => dispatch({ type: 'toggleDone', date, id })}
              onEdit={(s) => openEdit(s, date)}
              onAdd={() => openPicker('add', date)}
            />
          ) : (
            <WeekView
              state={state}
              date={date}
              onChangeDate={setDate}
              onOpenCalendar={() => setCalendar('main')}
              onOpenTimetables={() => setTimetableList(true)}
              onPlan={() => setRoute('ai')}
              onEdit={openEdit}
            />
          )}
          <SafeAreaView edges={['bottom']} style={styles.nav}>
            <BottomNav />
          </SafeAreaView>
        </SafeAreaView>
      ) : route === 'ai' ? (
        <AiPlanScreen
          state={state}
          setState={(s) => dispatch({ type: 'load', state: s })}
          weekOf={date}
          onBack={() => setRoute('main')}
          onManual={() => openPicker('plan', date)}
          onShowWeek={() => {
            setTab('week');
            setRoute('main');
          }}
        />
      ) : (
        <SlotPickerScreen
          {...pickerProps[route]}
          onPrev={() => openPicker(route, addDays(pickerDate, -pickerProps[route].step))}
          onNext={() => openPicker(route, addDays(pickerDate, pickerProps[route].step))}
          onPressDate={route === 'add' ? undefined : () => setCalendar('picker')}
          occupied={occupied}
          selection={selection}
          onToggle={toggle}
          onBack={leavePicker}
          onCancel={leavePicker}
          onClear={() => setSelection(noSelection())}
          onConfirm={confirmPicker}
        />
      )}

      <ScheduleSheet
        visible={!!sheet && !sheetHidden && !deletingSchedule && (sheet.mode === 'edit' ? route === 'main' : true)}
        mode={sheet?.mode ?? 'add'}
        draft={sheet?.draft ?? EMPTY_DRAFT}
        onSubmit={submitSheet}
        onClose={() => setSheet(null)}
        onDelete={() => editing && setDeletingSchedule(editing)}
        onChangeTime={changeTime}
      />
      <ActionModal
        visible={!!deletingSchedule}
        title="일정 삭제"
        message={`${deletingSchedule?.title ?? ''} 일정을 삭제하시겠습니까? 일정을 삭제한 후에는 다시 복구할 수 없습니다.`}
        confirmLabel="삭제하기"
        onCancel={() => setDeletingSchedule(null)}
        onConfirm={() => {
          if (deletingSchedule) dispatch({ type: 'deleteSchedule', id: deletingSchedule.id });
          setDeletingSchedule(null);
          setSheet(null);
        }}
      />
      <ActionModal
        visible={leavingPlan}
        title="계획 세우기 취소"
        message={'작성중이신 계획이 아직 저장되지 않았어요.\n계획 세우기를 중단하고 나가시겠어요?'}
        confirmLabel="나가기"
        onCancel={() => setLeavingPlan(false)}
        onConfirm={() => {
          setLeavingPlan(false);
          backToMain();
        }}
      />

      <CalendarSheet
        visible={!!calendar}
        date={calendar === 'picker' ? pickerDate : date}
        today={today}
        studiedMinutes={(d) => studySummary(state, d).done}
        onClose={() => setCalendar(null)}
        onPick={(d) => {
          if (calendar === 'picker') openPicker(route, d);
          else setDate(d);
          setCalendar(null);
        }}
      />

      <TimetableListSheet
        visible={timetableList && !deletingTimetable}
        timetables={state.timetables}
        activeId={state.activeTimetableId}
        onSelect={(id) => {
          dispatch({ type: 'selectTimetable', id });
          setTimetableList(false);
        }}
        onDelete={setDeletingTimetable}
        onAdd={() => {
          setTimetableList(false);
          setTimetableAdd(true);
        }}
        onClose={() => setTimetableList(false)}
      />
      <ActionModal
        visible={!!deletingTimetable}
        title="시간표 삭제"
        message="해당 시간표를 삭제할까요? 시간표를 삭제한 후에는 다시 복구할 수 없습니다."
        confirmLabel="삭제하기"
        onCancel={() => setDeletingTimetable(null)}
        onConfirm={() => {
          if (deletingTimetable) dispatch({ type: 'deleteTimetable', id: deletingTimetable.id });
          setDeletingTimetable(null);
        }}
      />
      <TimetableAddSheet
        visible={timetableAdd}
        onClose={() => setTimetableAdd(false)}
        onSubmit={(name) => {
          dispatch({ type: 'addTimetable', year: new Date().getFullYear(), name });
          setTimetableAdd(false);
        }}
      />
    </SafeAreaProvider>
  );
}

const EMPTY_DRAFT: ScheduleDraft = { kind: 'fixed', title: '', date: '1970-01-01', start: 0, end: 0 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  nav: { backgroundColor: colors.bgPrimary },
});
