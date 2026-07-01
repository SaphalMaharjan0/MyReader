import { Platform, PermissionsAndroid, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';

export const checkAndRequestStorageAccess = async () => {
  if (Platform.OS !== 'android') return true;

  const isExpoGo = Constants.appOwnership === 'expo';

  // 1. Silent check to see if root storage is already readable with standard folders
  try {
    const items = await FileSystem.readDirectoryAsync('file:///storage/emulated/0/');
    const standardFolders = ['download', 'documents', 'dcim', 'pictures', 'books'];
    const hasStandardFolders = items.some(name => standardFolders.includes(name.toLowerCase()));
    if (items && items.length > 0 && (items.length > 2 || hasStandardFolders)) {
      return true;
    }
    console.log('Root directory list is restricted, requesting full permissions...');
  } catch (e) {
    console.log('Root directory not directly readable, requesting permissions...');
  }

  // Detect if running in Expo Go
  if (isExpoGo) {
    return new Promise((resolve) => {
      Alert.alert(
        "Expo Go Storage Limitation",
        "Expo Go does not have system permissions to read your device's external storage folders directly.\n\nTo read books imported from external storage, you must run the standalone APK build.",
        [{ text: "OK", onPress: () => resolve(false) }]
      );
    });
  }

  // 2. Request standard READ_EXTERNAL_STORAGE permission
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
      {
        title: "Storage Permission Required",
        message: "SmartReader AI needs access to your device storage to view and import books.",
        buttonNeutral: "Ask Me Later",
        buttonNegative: "Cancel",
        buttonPositive: "OK"
      }
    );
    if (granted === PermissionsAndroid.RESULTS.GRANTED) {
      try {
        const items = await FileSystem.readDirectoryAsync('file:///storage/emulated/0/');
        const standardFolders = ['download', 'documents', 'dcim', 'pictures', 'books'];
        const hasStandardFolders = items.some(name => standardFolders.includes(name.toLowerCase()));
        if (items && items.length > 0 && (items.length > 2 || hasStandardFolders)) {
          return true;
        }
      } catch (err) {
        // Still restricted (Android 11+ Scoped Storage)
      }
    }
  } catch (err) {
    console.log('READ_EXTERNAL_STORAGE error', err);
  }

  // 3. Prompt user for All Files Access on Android 11+
  return new Promise((resolve) => {
    Alert.alert(
      "All Files Access Required",
      "On Android 11 and above, SmartReader AI needs 'All Files Access' to read books from the root storage directory. Please turn on 'Allow access to manage all files' in the app settings.",
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { 
          text: "Open Settings", 
          onPress: async () => {
            const { Linking } = require('react-native');
            try {
              // Try opening direct All Files settings for this package
              await Linking.sendIntent('android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION', [
                { key: 'package', value: 'com.saphalmaharjan.myreader' }
              ]);
              resolve(true);
            } catch (linkErr) {
              try {
                await Linking.openSettings();
                resolve(true);
              } catch (err) {
                console.log('Could not open settings', err);
                resolve(false);
              }
            }
          } 
        }
      ]
    );
  });
};
