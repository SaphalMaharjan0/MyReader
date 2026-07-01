import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  Image,
  Dimensions,
  Platform,
  PermissionsAndroid
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as fflate from 'fflate';
import { COLORS } from '../constants/theme';
import { useIsFocused } from '@react-navigation/native';
import Constants from 'expo-constants';

export default function FilesScreen() {
  const isFocused = useIsFocused();
  const [currentDir, setCurrentDir] = useState(FileSystem.documentDirectory);
  const [pathHistory, setPathHistory] = useState([FileSystem.documentDirectory]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  // Custom Modals
  const [createFolderVisible, setCreateFolderVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  useEffect(() => {
    const loadInitial = async () => {
      const { getSettings } = require('../utils/storage');
      const settings = await getSettings();
      if (settings) setIsDarkMode(settings.darkMode);
    };
    loadInitial();

    const { subscribeToSettings } = require('../utils/storage');
    const unsubscribe = subscribeToSettings((newSettings) => {
      setIsDarkMode(newSettings.darkMode);
    });
    return unsubscribe;
  }, []);

  const checkAndRequestStorageAccess = async () => {
    if (Platform.OS !== 'android') return true;

    // 1. Silent check to see if root storage is already readable
    try {
      await FileSystem.readDirectoryAsync('file:///storage/emulated/0/');
      return true;
    } catch (e) {
      console.log('Root directory not directly readable, requesting permissions...');
    }

    // Detect if running in Expo Go (appOwnership is 'expo')
    const isExpoGo = Constants.appOwnership === 'expo';
    if (isExpoGo) {
      return new Promise((resolve) => {
        Alert.alert(
          "Expo Go Storage Limitation",
          "Expo Go does not have system permissions to read your device's external storage folders directly.\n\nTo browse all files on your device here, you must run the standalone APK build. In the meantime, you can import books using the '+' button in the Library tab which uses the native document picker.",
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
          await FileSystem.readDirectoryAsync('file:///storage/emulated/0/');
          return true;
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

  useEffect(() => {
    let appStateSubscription;

    const init = async () => {
      if (isFocused) {
        const hasPermission = await checkAndRequestStorageAccess();
        if (hasPermission && Platform.OS === 'android') {
          const rootDir = 'file:///storage/emulated/0/';
          setCurrentDir(rootDir);
          setPathHistory([rootDir]);
        } else {
          setCurrentDir(FileSystem.documentDirectory);
          setPathHistory([FileSystem.documentDirectory]);
        }
      }
    };

    init();

    if (isFocused) {
      const { AppState } = require('react-native');
      appStateSubscription = AppState.addEventListener('change', async (nextAppState) => {
        if (nextAppState === 'active') {
          const hasPermission = await checkAndRequestStorageAccess();
          if (hasPermission && Platform.OS === 'android') {
            const rootDir = 'file:///storage/emulated/0/';
            setCurrentDir(rootDir);
            setPathHistory([rootDir]);
          }
        }
      });
    }

    return () => {
      if (appStateSubscription) {
        appStateSubscription.remove();
      }
    };
  }, [isFocused]);

  useEffect(() => {
    if (isFocused) {
      loadDirectoryContents();
    }
  }, [currentDir]);

  const loadDirectoryContents = async () => {
    setLoading(true);
    try {
      const items = await FileSystem.readDirectoryAsync(currentDir);
      const parsedItems = [];
      
      for (const name of items) {
        // Skip hidden system files and cover cache files
        if (name.startsWith('.') || name.startsWith('cover_')) continue;
        
        const itemUri = currentDir + (currentDir.endsWith('/') ? '' : '/') + name;
        try {
          const info = await FileSystem.getInfoAsync(itemUri);
          parsedItems.push({
            name,
            uri: itemUri,
            isDirectory: info.isDirectory,
            size: info.size,
          });
        } catch(err) {
          // Skip files/folders that fail access check
          continue;
        }
      }

      // Sort so directories are at the top, then books/files alphabetically
      parsedItems.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      setFiles(parsedItems);
    } catch (e) {
      console.log('Error reading directory:', e);
      if (currentDir === 'file:///storage/emulated/0/') {
         const downloadDir = 'file:///storage/emulated/0/Download/';
         try {
            await FileSystem.readDirectoryAsync(downloadDir);
            setCurrentDir(downloadDir);
            setPathHistory([downloadDir]);
            Alert.alert('Access Restricted', 'Access to root storage was denied by Android Scoped Storage. Redirecting to your Downloads folder.');
         } catch(err) {
            setCurrentDir(FileSystem.documentDirectory);
            setPathHistory([FileSystem.documentDirectory]);
            Alert.alert('Access Restricted', 'Could not access external device storage. Falling back to App Sandbox folder.');
         }
      } else {
         Alert.alert('Access Denied', 'Could not open this folder. Some system folders are restricted by Android.');
         handleNavigateUp();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateFolder = (folder) => {
    const nextDir = currentDir + (currentDir.endsWith('/') ? '' : '/') + folder.name + '/';
    setCurrentDir(nextDir);
    setPathHistory([...pathHistory, nextDir]);
  };

  const handleNavigateUp = () => {
    if (pathHistory.length > 1) {
      const newHistory = pathHistory.slice(0, -1);
      setPathHistory(newHistory);
      setCurrentDir(newHistory[newHistory.length - 1]);
    }
  };

  const base64ToUint8Array = (base64) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lookup = new Uint8Array(256);
    for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
    let bufferLength = base64.length * 0.75;
    if (base64[base64.length - 1] === '=') bufferLength--;
    if (base64[base64.length - 2] === '=') bufferLength--;

    const bytes = new Uint8Array(bufferLength);
    let p = 0;
    for (let i = 0; i < base64.length; i += 4) {
      const encoded1 = lookup[base64.charCodeAt(i)];
      const encoded2 = lookup[base64.charCodeAt(i+1)];
      const encoded3 = lookup[base64.charCodeAt(i+2)];
      const encoded4 = lookup[base64.charCodeAt(i+3)];

      bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
      if (encoded3 !== undefined && p < bufferLength) bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
      if (encoded4 !== undefined && p < bufferLength) bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }
    return bytes;
  };

  const uint8ToBase64 = (arr) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    const len = arr.length;
    for (let i = 0; i < len; i += 3) {
      const b1 = arr[i];
      const b2 = i + 1 < len ? arr[i + 1] : 0;
      const b3 = i + 2 < len ? arr[i + 2] : 0;
      
      const enc1 = b1 >> 2;
      const enc2 = ((b1 & 3) << 4) | (b2 >> 4);
      const enc3 = i + 1 < len ? ((b2 & 15) << 2) | (b3 >> 6) : 64;
      const enc4 = i + 2 < len ? b3 & 63 : 64;
      
      result += chars.charAt(enc1) + chars.charAt(enc2) + 
                (enc3 === 64 ? '=' : chars.charAt(enc3)) + 
                (enc4 === 64 ? '=' : chars.charAt(enc4));
    }
    return result;
  };

  const extractLocalCover = async (bookUri, bookId) => {
    try {
      const base64Data = await FileSystem.readAsStringAsync(bookUri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = base64ToUint8Array(base64Data);
      const unzipped = fflate.unzipSync(bytes);
      const fileKeys = Object.keys(unzipped);
      
      const containerKey = fileKeys.find(k => k.toLowerCase() === 'meta-inf/container.xml');
      if (!containerKey) return null;
      
      const containerBytes = unzipped[containerKey];
      let containerStr = '';
      for (let i = 0; i < containerBytes.length; i++) {
        containerStr += String.fromCharCode(containerBytes[i]);
      }
      
      const rootfileMatch = containerStr.match(/full-path=["']([^"']+)["']/i);
      if (!rootfileMatch) return null;
      const opfPath = rootfileMatch[1];
      
      const opfKey = fileKeys.find(k => k.toLowerCase() === opfPath.toLowerCase());
      if (!opfKey) return null;
      
      const opfBytes = unzipped[opfKey];
      let opfStr = '';
      for (let i = 0; i < opfBytes.length; i++) {
        opfStr += String.fromCharCode(opfBytes[i]);
      }
      
      const coverMetaMatch = opfStr.match(/<meta\s+[^>]*name=["']cover["'][^>]*content=["']([^"']+)["']/i) ||
                             opfStr.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']cover["']/i);
      let coverId = coverMetaMatch ? coverMetaMatch[1] : null;
      let coverHref = null;
      
      if (coverId) {
        const _escapedId = coverId.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const itemMatch = opfStr.match(new RegExp(`<item\\s+[^>]*id=["']${_escapedId}["'][^>]*href=["']([^"']+)["']`, 'i')) ||
                          opfStr.match(new RegExp(`<item\\s+[^>]*href=["']([^"']+)["']\\s+id=["']${_escapedId}["']`, 'i'));
        if (itemMatch) {
          coverHref = itemMatch[1];
        }
      }
      
      if (!coverHref) {
        const epub3Match = opfStr.match(/<item\s+[^>]*properties=["']cover-image["'][^>]*href=["']([^"']+)["']/i) ||
                           opfStr.match(/<item\s+[^>]*href=["']([^"']+)["']/i) ||
                           opfStr.match(/<item\s+[^>]*href=["']([^"']+)["'][^>]*properties=["']cover-image["']/i);
        if (epub3Match) {
          coverHref = epub3Match[1];
        }
      }
      
      if (!coverHref) {
        const fallbackMatch = opfStr.match(/<item\s+[^>]*id=["'][^"']*cover[^"']*["'][^>]*href=["']([^"']+)["']/i) ||
                              opfStr.match(/<item\s+[^>]*href=["']([^"']+)["'][^>]*id=["'][^"']*cover[^"']*["']/i);
        if (fallbackMatch) {
          coverHref = fallbackMatch[1];
        }
      }
      
      if (!coverHref) return null;
      
      coverHref = decodeURIComponent(coverHref);
      const opfDirIndex = opfPath.lastIndexOf('/');
      const opfDir = opfDirIndex !== -1 ? opfPath.substring(0, opfDirIndex + 1) : '';
      
      let resolvedPath = opfDir + coverHref;
      if (coverHref.startsWith('../')) {
        const parts = (opfDir + coverHref).split('/');
        const resolvedParts = [];
        for (const part of parts) {
          if (part === '..') {
            resolvedParts.pop();
          } else if (part !== '.' && part !== '') {
            resolvedParts.push(part);
          }
        }
        resolvedPath = resolvedParts.join('/');
      }
      
      let coverBytes = unzipped[resolvedPath];
      if (!coverBytes) {
        const lowerResolved = resolvedPath.toLowerCase();
        const matchingKey = fileKeys.find(k => k.toLowerCase() === lowerResolved || k.endsWith('/' + resolvedPath.split('/').pop().toLowerCase()));
        if (matchingKey) {
          coverBytes = unzipped[matchingKey];
        }
      }
      
      if (!coverBytes) return null;
      
      const coverBase64 = uint8ToBase64(coverBytes);
      const coverPath = FileSystem.documentDirectory + 'cover_' + bookId + '.jpg';
      await FileSystem.writeAsStringAsync(coverPath, coverBase64, { encoding: FileSystem.EncodingType.Base64 });
      
      return coverPath;
    } catch (e) {
      console.log('Error extracting local cover:', e);
      return null;
    }
  };

  const handleImportFile = (item) => {
    const nameLower = item.name.toLowerCase();
    const isEpub = nameLower.endsWith('.epub');
    const isPdf = nameLower.endsWith('.pdf');
    const isDoc = nameLower.endsWith('.docx') || nameLower.endsWith('.doc');
    const isPpt = nameLower.endsWith('.pptx') || nameLower.endsWith('.ppt');
    
    if (!isEpub && !isPdf && !isDoc && !isPpt) {
      Alert.alert('Unsupported Format', 'Please choose an EPUB, PDF, Word Document (.doc/.docx), or PowerPoint Presentation (.ppt/.pptx).');
      return;
    }

    let formatExt = '.epub';
    if (isPdf) formatExt = '.pdf';
    else if (nameLower.endsWith('.docx')) formatExt = '.docx';
    else if (nameLower.endsWith('.doc')) formatExt = '.doc';
    else if (nameLower.endsWith('.pptx')) formatExt = '.pptx';
    else if (nameLower.endsWith('.ppt')) formatExt = '.ppt';

    Alert.alert(
      'Import Book',
      `Import "${item.name.replace(formatExt, '')}" to your library?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Import', 
          onPress: async () => {
            try {
              const { saveBook } = require('../utils/storage');
              
              let bookType = 'application/epub+zip';
              if (isPdf) bookType = 'application/pdf';
              else if (isDoc) bookType = nameLower.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/msword';
              else if (isPpt) bookType = nameLower.endsWith('.pptx') ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/vnd.ms-powerpoint';

              // Copy the file to the app's internal sandbox directory for persistent access
              const safeName = Date.now() + '_' + item.name.replace(/[^a-zA-Z0-9.]/g, '_');
              const newUri = FileSystem.documentDirectory + safeName;
              await FileSystem.copyAsync({
                from: item.uri,
                to: newUri
              });

              const newBook = {
                id: Date.now().toString(),
                name: item.name,
                uri: newUri,
                type: bookType,
                dateAdded: new Date().toISOString(),
                coverUri: null
              };

              let importedBook = { ...newBook };
              if (isEpub) {
                try {
                  const coverPath = await extractLocalCover(newUri, newBook.id);
                  if (coverPath) {
                    importedBook.coverUri = coverPath;
                  }
                } catch(e) {
                  console.log("Failed to extract cover during import:", e);
                }
              }

              await saveBook(importedBook);
              Alert.alert('Success', 'Book imported successfully!');
            } catch(e) {
              console.log(e);
              Alert.alert('Error', 'Failed to import book.');
            }
          }
        }
      ]
    );
  };

  const handleDeleteItem = (item) => {
    Alert.alert(
      'Delete ' + (item.isDirectory ? 'Folder' : 'File'),
      `Are you sure you want to permanently delete "${item.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await FileSystem.deleteAsync(item.uri);
              loadDirectoryContents();
            } catch(e) {
              Alert.alert('Error', 'Could not delete item.');
            }
          }
        }
      ]
    );
  };

  const handleCreateFolderSubmit = async () => {
    if (!newFolderName || !newFolderName.trim()) {
      setCreateFolderVisible(false);
      return;
    }

    try {
      const folderUri = currentDir + (currentDir.endsWith('/') ? '' : '/') + newFolderName.trim() + '/';
      await FileSystem.makeDirectoryAsync(folderUri, { intermediates: true });
      setCreateFolderVisible(false);
      setNewFolderName('');
      loadDirectoryContents();
    } catch(e) {
      Alert.alert('Error', 'Could not create folder.');
    }
  };

  const formatPathLabel = () => {
    if (currentDir === 'file:///storage/emulated/0/') return 'Device Storage';
    if (currentDir === FileSystem.documentDirectory) return 'App Sandbox';
    
    if (currentDir.startsWith('file:///storage/emulated/0/')) {
      const relative = currentDir.substring('file:///storage/emulated/0/'.length);
      return 'Device Storage / ' + relative.replace(/\/$/, '').replace(/\//g, ' / ');
    }
    if (currentDir.startsWith(FileSystem.documentDirectory)) {
      const relative = currentDir.substring(FileSystem.documentDirectory.length);
      return 'App Sandbox / ' + relative.replace(/\/$/, '').replace(/\//g, ' / ');
    }
    return currentDir;
  };

  const toggleStorageRoot = async () => {
    if (currentDir.startsWith('file:///storage/emulated/0/')) {
      // Toggle to sandbox
      setCurrentDir(FileSystem.documentDirectory);
      setPathHistory([FileSystem.documentDirectory]);
    } else {
      // Toggle to device
      const hasPermission = await checkAndRequestStorageAccess();
      if (hasPermission && Platform.OS === 'android') {
        const rootDir = 'file:///storage/emulated/0/';
        setCurrentDir(rootDir);
        setPathHistory([rootDir]);
      } else if (Platform.OS !== 'android') {
        Alert.alert('Not Supported', 'Shared device storage browsing is only supported on Android devices.');
      } else {
        Alert.alert('Permission Denied', 'Storage permission is required to browse files.');
      }
    }
  };

  const renderFileItem = ({ item }) => {
    const nameLower = item.name.toLowerCase();
    const isEpub = nameLower.endsWith('.epub');
    const isPdf = nameLower.endsWith('.pdf');
    const isDoc = nameLower.endsWith('.docx') || nameLower.endsWith('.doc');
    const isPpt = nameLower.endsWith('.pptx') || nameLower.endsWith('.ppt');
    
    let iconName = 'file-tray-full-outline';
    let iconColor = '#888';
    
    if (item.isDirectory) {
      iconName = 'folder';
      iconColor = '#f39c12';
    } else if (isEpub) {
      iconName = 'book';
      iconColor = COLORS.primary;
    } else if (isPdf) {
      iconName = 'document-text';
      iconColor = '#e74c3c';
    } else if (isDoc) {
      iconName = 'document-text-outline';
      iconColor = '#3a7bd5';
    } else if (isPpt) {
      iconName = 'easel-outline';
      iconColor = '#d35400';
    }

    return (
      <View style={[styles.fileRow, { backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF', borderBottomWidth: isDarkMode ? 0 : 1, borderBottomColor: '#E5E5E5' }]}>
        <TouchableOpacity 
          style={styles.fileDetails} 
          onPress={() => item.isDirectory ? handleNavigateFolder(item) : handleImportFile(item)}
        >
          <Ionicons name={iconName} size={28} color={iconColor} style={styles.fileIcon} />
          <View style={styles.fileTextContainer}>
            <Text style={[styles.fileName, { color: isDarkMode ? '#FFF' : '#333' }]} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.fileSub}>
              {item.isDirectory ? 'Folder' : (item.size ? (item.size / 1024 / 1024).toFixed(2) + ' MB' : 'Book')}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.deleteButton} 
          onPress={() => handleDeleteItem(item)}
        >
          <Ionicons name="trash-outline" size={20} color="#e74c3c" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? '#121212' : '#F5F5F5' }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDarkMode ? '#121212' : '#F5F5F5', borderBottomColor: isDarkMode ? '#2A2A2A' : '#E0E0E0' }]}>
        {pathHistory.length > 1 && (
          <TouchableOpacity style={styles.backBtn} onPress={handleNavigateUp}>
            <Ionicons name="arrow-back" size={24} color={isDarkMode ? '#FFF' : '#333'} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: isDarkMode ? '#FFF' : '#333' }]}>File Storage</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{formatPathLabel()}</Text>
        </View>
        <TouchableOpacity 
          style={[styles.actionBtn, { marginRight: 10, backgroundColor: isDarkMode ? '#222' : '#E0E0E0' }]} 
          onPress={toggleStorageRoot}
        >
          <Ionicons 
            name={currentDir.startsWith('file:///storage/emulated/0/') ? "swap-horizontal" : "hardware-chip-outline"} 
            size={24} 
            color={isDarkMode ? '#FFF' : '#333'} 
          />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.actionBtn} 
          onPress={() => setCreateFolderVisible(true)}
        >
          <Ionicons name="folder-open-outline" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Directory Content List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : files.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="folder-open-outline" size={64} color={isDarkMode ? '#555' : '#CCC'} />
          <Text style={[styles.emptyText, { color: isDarkMode ? '#FFF' : '#333' }]}>This folder is empty.</Text>
          <Text style={styles.emptySubText}>Tap folder icon in header to create a new folder.</Text>
        </View>
      ) : (
        <FlatList 
          data={files}
          keyExtractor={(item) => item.uri}
          renderItem={renderFileItem}
          contentContainerStyle={styles.list}
        />
      )}

      {/* Create Folder Modal */}
      <Modal visible={createFolderVisible} transparent={true} animationType="fade" onRequestClose={() => setCreateFolderVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCreateFolderVisible(false)}>
          <View style={[styles.modalContent, { backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF' }]}>
            <Text style={[styles.modalTitle, { color: isDarkMode ? '#FFF' : '#333' }]}>Create New Folder</Text>
            <TextInput 
              style={[styles.input, { backgroundColor: isDarkMode ? '#2A2A2A' : '#E0E0E0', color: isDarkMode ? '#FFF' : '#333' }]}
              placeholder="Folder Name"
              placeholderTextColor="#666"
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => { setCreateFolderVisible(false); setNewFolderName(''); }} style={styles.cancelBtn}>
                <Text style={{ color: '#AAA', fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateFolderSubmit} style={styles.createBtn}>
                <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold' }}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#121212',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  backBtn: {
    marginRight: 15,
    padding: 5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  headerSub: {
    fontSize: 12,
    color: '#AAA',
    marginTop: 2,
  },
  actionBtn: {
    padding: 8,
    backgroundColor: '#3a7bd5',
    borderRadius: 8,
  },
  list: {
    padding: 10,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    marginBottom: 10,
    borderRadius: 10,
    padding: 15,
  },
  fileDetails: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileIcon: {
    marginRight: 15,
  },
  fileTextContainer: {
    flex: 1,
  },
  fileName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '500',
  },
  fileSub: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  deleteButton: {
    padding: 10,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 15,
  },
  emptySubText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#2A2A2A',
    color: '#FFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  modalBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    padding: 10,
    marginRight: 15,
  },
  createBtn: {
    padding: 10,
    backgroundColor: '#3a7bd5',
    borderRadius: 8,
    paddingHorizontal: 20,
  },
});
