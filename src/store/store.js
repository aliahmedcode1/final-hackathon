import { configureStore, createSlice } from '@reduxjs/toolkit';

const sessionSlice = createSlice({
  name: 'session',
  initialState: { user: null, settings: null, loaded: false },
  reducers: {
    setSession(state, action) {
      state.user = action.payload.user || null;
      state.settings = action.payload.settings || null;
      state.loaded = true;
    },
    setSettings(state, action) {
      state.settings = action.payload;
    },
    clearSession(state) {
      state.user = null;
      state.settings = null;
      state.loaded = true;
    },
  },
});

const uiSlice = createSlice({
  name: 'ui',
  initialState: { toasts: [] },
  reducers: {
    pushToast(state, action) {
      state.toasts.push({ id: crypto.randomUUID(), ...action.payload });
    },
    dismissToast(state, action) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
  },
});

export const { setSession, setSettings, clearSession } = sessionSlice.actions;
export const { pushToast, dismissToast } = uiSlice.actions;

export const makeStore = () =>
  configureStore({
    reducer: {
      session: sessionSlice.reducer,
      ui: uiSlice.reducer,
    },
  });

export default makeStore;
