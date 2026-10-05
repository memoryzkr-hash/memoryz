import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useReducer, useRef } from 'react';

import { initialState, newId } from './planner';
import type { DateKey, PlannerState, Schedule } from './types';

const KEY = 'memoryz/timetable/v2';

export type Action =
  | { type: 'load'; state: PlannerState }
  | { type: 'addSchedules'; schedules: Schedule[] }
  | { type: 'updateSchedule'; schedule: Schedule }
  | { type: 'deleteSchedule'; id: string }
  | { type: 'toggleDone'; date: DateKey; id: string }
  | { type: 'addTimetable'; year: number; name: string }
  | { type: 'deleteTimetable'; id: string }
  | { type: 'selectTimetable'; id: string };

export function reducer(state: PlannerState, action: Action): PlannerState {
  switch (action.type) {
    case 'load':
      return action.state;
    case 'addSchedules':
      return { ...state, schedules: [...state.schedules, ...action.schedules] };
    case 'updateSchedule':
      return { ...state, schedules: state.schedules.map((s) => (s.id === action.schedule.id ? action.schedule : s)) };
    case 'deleteSchedule': {
      const completions: PlannerState['completions'] = {};
      for (const [date, ids] of Object.entries(state.completions)) completions[date] = ids.filter((i) => i !== action.id);
      return { ...state, schedules: state.schedules.filter((s) => s.id !== action.id), completions };
    }
    case 'toggleDone': {
      const ids = state.completions[action.date] ?? [];
      const next = ids.includes(action.id) ? ids.filter((i) => i !== action.id) : [...ids, action.id];
      return { ...state, completions: { ...state.completions, [action.date]: next } };
    }
    case 'addTimetable': {
      const t = { id: newId(), year: action.year, name: action.name.trim() };
      return { ...state, timetables: [t, ...state.timetables], activeTimetableId: t.id };
    }
    case 'deleteTimetable':
      if (action.id === state.activeTimetableId) return state;
      return {
        ...state,
        timetables: state.timetables.filter((t) => t.id !== action.id),
        schedules: state.schedules.filter((s) => s.timetableId !== action.id),
      };
    case 'selectTimetable':
      return { ...state, activeTimetableId: action.id };
  }
}

/** 기기에 저장되는 플래너 상태. 처음 불러오기 전에는 loaded가 false. */
export function usePlanner() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(new Date()));
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) dispatch({ type: 'load', state: JSON.parse(raw) as PlannerState });
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
      });
  }, []);

  useEffect(() => {
    if (loaded.current) AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  return [state, dispatch] as const;
}
