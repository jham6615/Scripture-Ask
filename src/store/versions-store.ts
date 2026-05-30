import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'bf:version';

type VersionState = {
  code: string;
  name: string;
  /** Switch the active Bible version (and remember it). */
  setVersion: (code: string, name: string) => void;
  /** Load the saved version on app start. */
  hydrate: () => void;
};

export const useVersionStore = create<VersionState>((set) => ({
  code: 'web',
  name: 'World English Bible',
  setVersion: (code, name) => {
    set({ code, name });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ code, name })).catch(() => {});
  },
  hydrate: () => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as { code?: string; name?: string };
        if (saved.code && saved.name) set({ code: saved.code, name: saved.name });
      })
      .catch(() => {});
  },
}));
