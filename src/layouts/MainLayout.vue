<template>
  <q-layout class="non-selectable column no-wrap" view="hHh LpR lFr">
    <!-- Top bar -->
    <HeaderBase />

    <!-- Side navigation -->
    <NavDrawer v-model="miniState" />

    <!-- Main content -->
    <q-scroll-area
      :bar-style="barStyle"
      :thumb-style="thumbStyle"
      style="flex: 1 1 1px"
    >
      <q-page-container class="main-bg">
        <AnnouncementBanner />
        <router-view />
      </q-page-container>
    </q-scroll-area>

    <!-- Footer -->
    <q-footer
      v-if="
        currentSettings?.enableMediaDisplayButton ||
        currentSettings?.enableMusicButton
      "
      :style="
        'left: calc(50% + ' + (miniState ? '28' : '150') + 'px) !important'
      "
      class="q-pb-sm"
    >
      <ActionIsland />
    </q-footer>
  </q-layout>
</template>

<script setup lang="ts">
import type { ElectronIpcListenKey } from 'src/types';

import { watchDebounced, watchImmediate, whenever } from '@vueuse/core';
// Packages
import { storeToRefs } from 'pinia';
import { useQuasar } from 'quasar';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
// Globals
import { queues } from 'src/boot/globals';
import { localeOptions } from 'src/i18n';
// Components
import HeaderBase from 'src/components/header/HeaderBase.vue';
import ActionIsland from 'src/components/ui/ActionIsland.vue';
import AnnouncementBanner from 'src/components/ui/AnnouncementBanner.vue';
import NavDrawer from 'src/components/ui/NavDrawer.vue';
import { useScrollbar } from 'src/composables/useScrollbar';
// Helpers
import {
  cleanAdditionalMediaFolder,
  cleanLocalStorage,
} from 'src/helpers/cleanup';
import {
  remainingTimeBeforeMeetingStart,
  updateLookupPeriod,
} from 'src/helpers/date';
import { errorCatcher } from 'src/helpers/error-catcher';
import { setElementFont } from 'src/helpers/fonts';
import { getFileUrl, watchExternalFolder } from 'src/helpers/fs';
import { sorter } from 'src/helpers/general';
import {
  downloadBackgroundMusic,
  downloadSongbookVideos,
  setUrlVariables,
  watchedItemMapper,
} from 'src/helpers/jw-media';
import {
  executeShortcut,
  registerAllCustomShortcuts,
  unregisterAllCustomShortcuts,
} from 'src/helpers/keyboardShortcuts';
import { showMediaWindow } from 'src/helpers/mediaPlayback';
import { createTemporaryNotification } from 'src/helpers/notifications';
// Stores
import { useCurrentStateStore } from 'src/stores/current-state';
import { useJwStore } from 'src/stores/jw';

const { barStyle, thumbStyle } = useScrollbar();

// Local state
const miniState = ref(true);

// Icon mapping
const $q = useQuasar();

$q.iconMapFn = (iconName) => {
  if (iconName.startsWith('chevron_')) {
    iconName = iconName.replace('chevron_', 'mmm-');
  } else if (iconName.startsWith('keyboard_arrow_')) {
    iconName = iconName.replace('keyboard_arrow_', 'mmm-');
  } else if (iconName.startsWith('arrow_drop_')) {
    iconName = 'mmm-dropdown-arrow';
  } else if (iconName === 'cancel' || iconName === 'close') {
    iconName = 'clear';
  }
  if (!iconName.startsWith('mmm-')) {
    iconName = 'mmm-' + iconName;
  }
  return {
    cls: iconName,
  };
};

// Routes and translations
const route = useRoute();
const router = useRouter();
const { locale, t } = useI18n({ useScope: 'global' });

// Store initializations
// const congregationSettings = useCongregationSettingsStore();
// congregationSettings.$subscribe((_, state) => {
//   saveSettingsStoreToFile('congregations', state);
// });

const jwStore = useJwStore();
// jwStore.$subscribe((_, state) => {
//   saveSettingsStoreToFile('jw', state);
// });

const { updateJwLanguages } = jwStore;
updateJwLanguages();

const currentState = useCurrentStateStore();
const {
  currentCongregation,
  currentSettings,
  downloadProgress,
  mediaPlaying,
  online,
  selectedDate,
  selectedDateObject,
  watchFolderMedia,
} = storeToRefs(currentState);

watch(currentCongregation, (newCongregation, oldCongregation) => {
  try {
    if (oldCongregation && queues.meetings[oldCongregation]) {
      queues.meetings[oldCongregation].pause();
    }
    if (!newCongregation) {
      showMediaWindow(false);
      navigateToCongregationSelector();
    } else {
      downloadProgress.value = {};
      updateLookupPeriod();
      registerAllCustomShortcuts();
      downloadBackgroundMusic();
      if (queues.meetings[newCongregation]) {
        queues.meetings[newCongregation].start();
      }
    }
  } catch (error) {
    errorCatcher(error);
  }
});

watch(online, (isNowOnline) => {
  try {
    const congregation = currentCongregation.value;
    if (!congregation) return;

    const { /*downloads,*/ meetings } = queues;
    // const downloadQueue = downloads[congregation];
    const meetingQueue = meetings[congregation];

    if (isNowOnline) {
      // downloadQueue?.start();
      meetingQueue?.start();
    } else {
      // downloadQueue?.pause();
      meetingQueue?.pause();
    }
  } catch (error) {
    errorCatcher(error);
  }
});

const navigateToCongregationSelector = () => {
  try {
    if (!route.fullPath.includes('/congregation-selector')) {
      router.push({ path: '/congregation-selector' });
      selectedDate.value = '';
    }
  } catch (error) {
    errorCatcher(error);
  }
};

watch(currentSettings, (newSettings) => {
  if (!newSettings) navigateToCongregationSelector();
});

watchImmediate(
  () => currentSettings.value?.darkMode,
  (newDarkMode) => {
    $q.dark.set(newDarkMode ?? 'auto');
  },
);

whenever(
  () => currentSettings.value?.localAppLang,
  (newAppLang) => {
    if (newAppLang.includes('-')) newAppLang = newAppLang.split('-')[0];
    if (
      currentSettings.value &&
      !localeOptions?.map((option) => option.value).includes(newAppLang)
    ) {
      currentSettings.value.localAppLang = 'en';
    } else {
      locale.value = newAppLang;
    }
  },
);

watchDebounced(
  () => [currentSettings.value?.baseUrl, currentCongregation.value],
  async ([newBaseUrl, newCongregation], [oldBaseUrl]) => {
    if (!!newCongregation && newBaseUrl !== oldBaseUrl) {
      await setUrlVariables(newBaseUrl);
      setElementFont('JW-Icons');
    }
  },
  { debounce: 500 },
);

watch(
  () => [
    currentCongregation.value,
    currentSettings.value?.lang,
    currentSettings.value?.langFallback,
    currentSettings.value?.langSubtitles,
    currentSettings.value?.enableSubtitles,
    currentSettings.value?.mwDay,
    currentSettings.value?.weDay,
    currentSettings.value?.coWeek,
    currentSettings.value?.disableMediaFetching,
  ],
  (
    [newCurrentCongregation, , , , , , ,],
    [oldCurrentCongregation, , , , , , ,],
  ) => {
    if (newCurrentCongregation === oldCurrentCongregation)
      updateLookupPeriod(true);
  },
);

const { setAutoStartAtLogin } = window.electronApi;

watch(
  () => currentSettings.value?.autoStartAtLogin,
  (newAutoStartAtLogin) => {
    setAutoStartAtLogin(!!newAutoStartAtLogin);
  },
);

watch(
  () => currentSettings.value?.enableExtraCache,
  (newEnableExtraCache, oldEnableExtraCache) => {
    try {
      if (
        newEnableExtraCache &&
        oldEnableExtraCache !== undefined &&
        oldEnableExtraCache !== newEnableExtraCache
      ) {
        downloadSongbookVideos();
      }
    } catch (error) {
      errorCatcher(error);
    }
  },
);

watch(
  () => [
    currentCongregation.value,
    currentSettings.value?.enableKeyboardShortcuts,
  ],
  ([newCongregation, newEnableKeyboardShortcuts], [oldCongregation]) => {
    if (newCongregation !== oldCongregation || !newEnableKeyboardShortcuts) {
      unregisterAllCustomShortcuts();
    }
    if (newEnableKeyboardShortcuts) {
      registerAllCustomShortcuts();
    }
  },
);

watchImmediate(
  () => [
    currentSettings.value?.folderToWatch,
    currentSettings.value?.enableFolderWatcher,
  ],
  ([newFolderToWatch, newEnableFolderWatcher]) => {
    watchExternalFolder(
      newEnableFolderWatcher ? (newFolderToWatch as string) : undefined,
    );
  },
);

const updateWatchFolderRef = async ({
  changedPath,
  day,
  event,
}: Record<string, string>) => {
  try {
    day = day.replace(/-/g, '/');
    if (event === 'addDir' || event === 'unlinkDir') {
      watchFolderMedia.value[day] = [];
    } else if (event === 'add') {
      watchFolderMedia.value[day] ??= [];
      const watchedItemMap = await watchedItemMapper(day, changedPath);
      if (watchedItemMap) {
        watchFolderMedia.value[day].push(watchedItemMap);

        watchFolderMedia.value[day].sort((a, b) =>
          sorter.compare(a.title, b.title),
        );

        if (jwStore.mediaSort[currentCongregation.value]?.[day]?.length) {
          jwStore.mediaSort[currentCongregation.value]?.[day]?.push(
            watchedItemMap?.uniqueId,
          );
        }
      }
    } else if (event === 'unlink') {
      watchFolderMedia.value[day] = watchFolderMedia.value[day]?.filter(
        (dM) => dM.fileUrl !== getFileUrl(changedPath),
      );
    }
  } catch (error) {
    errorCatcher(error);
  }
};

cleanLocalStorage();
cleanAdditionalMediaFolder();

const closeAttempts = ref(0);

const bcClose = new BroadcastChannel('closeAttempts');
bcClose.onmessage = (event) => {
  if (event?.data?.attemptedClose) {
    const meetingDay =
      !!selectedDateObject.value?.today && !!selectedDateObject.value?.meeting;
    if (
      (mediaPlaying.value ||
        (currentCongregation.value && // a congregation is selected
          !currentSettings.value?.disableMediaFetching && // media fetching is enabled
          meetingDay && // today is a meeting day
          remainingTimeBeforeMeetingStart() < 90)) && // meeting is starting in less than 90 seconds
      closeAttempts.value === 0
    ) {
      createTemporaryNotification({
        caption: ref(t('clicking-the-close-button-again-will-close-app')).value,
        icon: 'mmm-error',
        message: ref(t('make-sure-that-m-is-in-not-use-before-quitting')).value,
        noClose: true,
        progress: true,
        timeout: 10000,
        type: 'negative',
      });
      closeAttempts.value += 1;
      setTimeout(() => {
        closeAttempts.value = 0;
      }, 10000);
    } else {
      const bcClose = new BroadcastChannel('closeAttempts');
      bcClose.postMessage({ authorizedClose: true });
    }
  }
};

const initListeners = () => {
  window.electronApi.onLog(({ ctx, level, msg }) => {
    console[level](`[main] ${msg}`, ctx);
  });

  window.electronApi.onShortcut(({ shortcut }) => {
    if (!currentSettings.value?.enableKeyboardShortcuts) return;
    executeShortcut(shortcut);
  });

  window.electronApi.onWatchFolderUpdate(({ changedPath, day, event }) => {
    updateWatchFolderRef({ changedPath, day, event });
  });

  window.electronApi.onDownloadStarted((args) => {
    downloadProgress.value[args.id] = {
      filename: args.filename,
      total: args.totalBytes,
    };
  });

  window.electronApi.onDownloadCancelled((args) => {
    if (downloadProgress.value[args.id])
      downloadProgress.value[args.id].error = true;
  });

  window.electronApi.onDownloadCompleted((args) => {
    if (downloadProgress.value[args.id]) {
      downloadProgress.value[args.id].complete = true;
      delete downloadProgress.value[args.id].loaded;
    }
  });

  window.electronApi.onDownloadError((args) => {
    if (downloadProgress.value[args.id])
      downloadProgress.value[args.id].error = true;
  });

  window.electronApi.onDownloadProgress((args) => {
    if (downloadProgress.value[args.id]) {
      downloadProgress.value[args.id].loaded = args.bytesReceived;
    }
  });
};

const removeListeners = () => {
  const listeners: ElectronIpcListenKey[] = [
    'log',
    'shortcut',
    'watchFolderUpdate',
    'downloadStarted',
    'downloadCancelled',
    'downloadCompleted',
    'downloadError',
    'downloadProgress',
  ];

  listeners.forEach((listener) => {
    window.electronApi.removeListeners(listener);
  });
};

onMounted(() => {
  document.title = 'Meeting Media Manager';
  if (!currentSettings.value) navigateToCongregationSelector();
  document.body.style.overflow = 'hidden';
  setElementFont('JW-Icons');
  initListeners();
});

onBeforeUnmount(() => {
  removeListeners();
});
</script>
