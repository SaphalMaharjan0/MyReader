import AsyncStorage from '@react-native-async-storage/async-storage';

const TOOLBAR_KEY = '@reader_toolbar_config';

export const DEFAULT_TOOLBAR_BUTTONS = [
  { id: 'orientation', name: 'Screen Orientation', icon: 'sync-outline', enabled: true },
  { id: 'daynight', name: 'Day/Night Mode', icon: 'moon-outline', enabled: true },
  { id: 'tts', name: 'Speak / Text-to-Speech', icon: 'volume-high-outline', enabled: true },
  { id: 'autoscroll', name: 'Autoscroll', icon: 'caret-down-circle-outline', enabled: true },
  { id: 'chapters', name: 'Chapters', icon: 'list-outline', enabled: true },
  { id: 'bookmarks', name: 'Bookmarks', icon: 'bookmark-outline', enabled: true },
  { id: 'visual', name: 'Visual Options', icon: 'color-palette-outline', enabled: true },
  { id: 'brightness', name: 'Brightness', icon: 'sunny-outline', enabled: true },
  { id: 'search', name: 'Search', icon: 'search-outline', enabled: true },
  { id: 'tilt', name: 'Allow Tilt Device to Turn Page', icon: 'phone-landscape-outline', enabled: false },
  { id: 'fontsize', name: 'Font Size', icon: 'text-outline', enabled: true },
  { id: 'control', name: 'Control Options', icon: 'options-outline', enabled: false },
  { id: 'misc', name: 'Miscellaneous', icon: 'apps-outline', enabled: false },
  { id: 'themes', name: 'Themes', icon: 'color-fill-outline', enabled: false },
  { id: 'images', name: 'Image Gallery', icon: 'images-outline', enabled: true },
  { id: 'options', name: 'Options', icon: 'settings-outline', enabled: true },
  { id: 'dualpage', name: 'Dual-Page Mode Switch', icon: 'book-outline', enabled: false },
  { id: 'shutdown', name: 'Shutdown', icon: 'power-outline', enabled: false },
  { id: 'customize', name: 'Customize Reader Bar Buttons', icon: 'build-outline', enabled: true },
];

export const getToolbarConfig = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(TOOLBAR_KEY);
    if (jsonValue != null) {
      return JSON.parse(jsonValue);
    }
    return DEFAULT_TOOLBAR_BUTTONS;
  } catch (e) {
    console.error('Error reading toolbar config', e);
    return DEFAULT_TOOLBAR_BUTTONS;
  }
};

export const saveToolbarConfig = async (config) => {
  try {
    const jsonValue = JSON.stringify(config);
    await AsyncStorage.setItem(TOOLBAR_KEY, jsonValue);
  } catch (e) {
    console.error('Error saving toolbar config', e);
  }
};
