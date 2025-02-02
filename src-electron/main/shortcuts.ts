import type { SettingsValues } from 'src/types';

import { globalShortcut } from 'electron';
import { captureElectronError } from 'main/utils';
import { sendToWindow } from 'main/window/window-base';
import { mainWindow } from 'main/window/window-main';

export const registerShortcut = (
  name: keyof SettingsValues,
  keySequence: string,
) => {
  if (!keySequence) return;
  try {
    unregisterShortcut(keySequence);
    return globalShortcut.register(keySequence, () => {
      sendToWindow(mainWindow, 'shortcut', { shortcut: name });
    });
  } catch (e) {
    captureElectronError(e);
  }
};

export const unregisterShortcut = (keySequence: string) => {
  if (!keySequence) return;
  try {
    if (globalShortcut.isRegistered(keySequence)) {
      globalShortcut.unregister(keySequence);
    }
  } catch (e) {
    captureElectronError(e);
  }
};

export const unregisterAllShortcuts = () => {
  try {
    globalShortcut.unregisterAll();
  } catch (e) {
    captureElectronError(e);
  }
};
