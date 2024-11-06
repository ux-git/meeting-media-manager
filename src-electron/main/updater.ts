import { autoUpdater } from 'electron-updater';
import { exists } from 'fs-extra';
import { join } from 'path';

import { errorCatcher, getUserDataPath } from './../utils';

export async function initUpdater() {
  const disabled = await exists(
    join(getUserDataPath(), 'Global Preferences', 'disable-updates'),
  );
  if (!disabled) triggerUpdateCheck();
}

const triggerUpdateCheck = async (attempt = 1) => {
  try {
    const { default: isOnline } = await import('is-online');
    const online = await isOnline();
    if (online) {
      autoUpdater.checkForUpdatesAndNotify();
    } else {
      if (attempt < 5) {
        setTimeout(() => triggerUpdateCheck(attempt + 1), 5000);
      }
    }
  } catch (error) {
    errorCatcher(error);
  }
};
