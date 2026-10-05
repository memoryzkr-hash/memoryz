import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Course } from './types';

const KEY = 'timetable/courses/v1';

export async function loadCourses(): Promise<Course[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Course[]) : [];
  } catch {
    return [];
  }
}

export async function saveCourses(courses: Course[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(courses));
}
