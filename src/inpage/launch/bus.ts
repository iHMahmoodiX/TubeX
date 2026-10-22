// A tiny in-memory event bus between islands of the same content script (top-bar button → drawer,
// Videolytics → watch bar). No timers, no DOM events on the page.
import { useEffect, useState } from 'react';

export type DrawerView = 'page' | 'tools' | 'alerts' | 'settings';
export interface DrawerRequest {
  /** 'open' shows the drawer (on `view` when given); 'toggle' closes it when it is already open. */
  mode: 'open' | 'toggle';
  view?: DrawerView;
  /** Where focus goes back when the drawer closes (e.g. the top-bar button inside its own shadow root). */
  returnTo?: HTMLElement | null;
}

function channel<T>() {
  const subs = new Set<(v: T) => void>();
  return {
    emit: (v: T) => subs.forEach((cb) => cb(v)),
    on: (cb: (v: T) => void) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    size: () => subs.size,
  };
}

const drawer = channel<DrawerRequest>();
/** Opens (or toggles) the TubeX drawer. Returns false when no drawer is listening (its switch is off). */
export function requestDrawer(req: DrawerRequest): boolean {
  if (!drawer.size()) return false;
  drawer.emit(req);
  return true;
}
export const onDrawerRequest = drawer.on;

// Whether the drawer is open, so top-bar buttons can reflect it (aria-expanded).
let drawerOpen = false;
const openState = channel<boolean>();
export function setDrawerOpen(v: boolean) {
  if (v === drawerOpen) return;
  drawerOpen = v;
  openState.emit(v);
}
export function useDrawerOpen(): boolean {
  const [v, setV] = useState(drawerOpen);
  useEffect(() => openState.on(setV), []);
  return v;
}

// Whether the Videolytics panel is on screen, so the bar under the video can stay compact (no duplicate numbers).
let vlShown = false;
const vl = channel<boolean>();
export function setVideolyticsShown(v: boolean) {
  if (v === vlShown) return;
  vlShown = v;
  vl.emit(v);
}
export function useVideolyticsShown(): boolean {
  const [v, setV] = useState(vlShown);
  useEffect(() => {
    setV(vlShown);
    return vl.on(setV);
  }, []);
  return v;
}

// Videolytics' SEO score asks the watch bar to open its SEO checklist.
const seo = channel<void>();
export const requestWatchSeo = () => seo.emit();
export const onWatchSeo = seo.on;
