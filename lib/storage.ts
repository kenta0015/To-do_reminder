//lib/storage.ts

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Task {
  id: string;
  title: string;
  when: 'today' | 'tomorrow' | string; // ISO date string for future dates
  completed: boolean;
  completedAt?: string; // ISO timestamp
  createdAt: string;
}

const TASKS_KEY = '@tasks';

export const saveTasks = async (tasks: Task[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  } catch (error) {
    console.error('Error saving tasks:', error);
  }
};

export const loadTasks = async (): Promise<Task[]> => {
  try {
    const data = await AsyncStorage.getItem(TASKS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading tasks:', error);
    return [];
  }
};

export const addTask = async (title: string, when: string): Promise<Task> => {
  const tasks = await loadTasks();
  const newTask: Task = {
    id: Date.now().toString(),
    title,
    when,
    completed: false,
    createdAt: new Date().toISOString(),
  };
  tasks.push(newTask);
  await saveTasks(tasks);
  return newTask;
};

export const updateTask = async (id: string, updates: Partial<Task>): Promise<void> => {
  const tasks = await loadTasks();
  const index = tasks.findIndex(t => t.id === id);
  if (index !== -1) {
    tasks[index] = { ...tasks[index], ...updates };
    await saveTasks(tasks);
  }
};

export const deleteTask = async (id: string): Promise<void> => {
  const tasks = await loadTasks();
  const filtered = tasks.filter(t => t.id !== id);
  await saveTasks(filtered);
};

export const completeTask = async (id: string): Promise<void> => {
  await updateTask(id, {
    completed: true,
    completedAt: new Date().toISOString(),
  });
};

export const uncompleteTask = async (id: string): Promise<void> => {
  await updateTask(id, {
    completed: false,
    completedAt: undefined,
  });
};
