import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Animated, 
  ScrollView, 
  Switch, 
  Modal, 
  Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { COLORS } from '../constants/theme';
import { getSettings, updateSettings, subscribeToSettings, getBooks, clearBooks, importMoonReaderData } from '../utils/storage';

export default function SettingsDrawer({ visible, onClose, navigation, onBooksUpdated }) {
  const [renderDrawer, setRenderDrawer] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [autoSync, setAutoSync] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [readingTheme, setReadingTheme] = useState('dark');
  const [defaultFontSize, setDefaultFontSize] = useState(100);
  const [fontFamily, setFontFamily] = useState('System');
  
  // Stats
  const [totalBooks, setTotalBooks] = useState(0);
  const [finishedBooks, setFinishedBooks] = useState(0);
  const [readingBooks, setReadingBooks] = useState(0);

  // Modal controls
  const [fontModalVisible, setFontModalVisible] = useState(false);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [fontFamilyModalVisible, setFontFamilyModalVisible] = useState(false);

  const drawerAnim = useRef(new Animated.Value(0)).current;

  // Track visibility & run animations
  useEffect(() => {
    if (visible) {
      setRenderDrawer(true);
      Animated.timing(drawerAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
      loadStats();
    } else {
      Animated.timing(drawerAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRenderDrawer(false);
      });
    }
  }, [visible]);

  // Subscribe to settings changes globally
  useEffect(() => {
    const loadInitial = async () => {
      const settings = await getSettings();
      applySettings(settings);
    };
    loadInitial();

    const unsubscribe = subscribeToSettings((newSettings) => {
      applySettings(newSettings);
    });
    return unsubscribe;
  }, []);

  const applySettings = (settings) => {
    if (settings) {
      if (typeof settings.darkMode === 'boolean') setIsDarkMode(settings.darkMode);
      if (typeof settings.autoSync === 'boolean') setAutoSync(settings.autoSync);
      if (typeof settings.notifications === 'boolean') setNotifications(settings.notifications);
      if (settings.readingTheme) setReadingTheme(settings.readingTheme);
      if (settings.defaultFontSize) setDefaultFontSize(settings.defaultFontSize);
      if (settings.fontFamily) setFontFamily(settings.fontFamily);
    }
  };

  const loadStats = async () => {
    try {
      const books = await getBooks();
      setTotalBooks(books.length);
      setFinishedBooks(books.filter(b => (b.progress || 0) >= 1.0).length);
      setReadingBooks(books.filter(b => (b.progress || 0) > 0 && (b.progress || 0) < 1.0).length);
    } catch(e) {
      console.log('Error loading stats', e);
    }
  };

  const handleToggleSetting = async (key, value) => {
    await updateSettings({ [key]: value });
  };

  const handleSaveSetting = async (key, value) => {
    await updateSettings({ [key]: value });
  };

  const handleClearCache = async () => {
    Alert.alert(
      "Clear Cache",
      "This will remove temporary files and cached book covers to free up space. Your books and reading progress will not be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Clear", 
          style: "destructive",
          onPress: async () => {
             try {
               const cacheDir = FileSystem.cacheDirectory;
               const files = await FileSystem.readDirectoryAsync(cacheDir);
               for (const file of files) {
                 await FileSystem.deleteAsync(cacheDir + file, { idempotent: true });
               }
               Alert.alert("Success", "Cache has been cleared.");
             } catch(e) {
               console.error(e);
               Alert.alert("Error", "Could not clear cache completely.");
             }
          }
        }
      ]
    );
  };

  const handleClearLibrary = async () => {
    Alert.alert(
      'Clear Library',
      'Are you sure you want to remove all books from your library? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear', 
          style: 'destructive',
          onPress: async () => {
            const success = await clearBooks();
            if (success) {
              if (onBooksUpdated) onBooksUpdated([]);
              loadStats();
              Alert.alert('Success', 'Library has been cleared.');
            } else {
              Alert.alert('Error', 'Could not clear library.');
            }
          }
        }
      ]
    );
  };

  const handleImportBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const fileUri = result.assets[0].uri;
        const fileName = result.assets[0].name.toLowerCase();

        const isBase64 = fileName.endsWith('.mrpro') || fileName.endsWith('.zip');
        const content = await FileSystem.readAsStringAsync(fileUri, isBase64 ? { encoding: FileSystem.EncodingType.Base64 } : {});

        const updatedBooks = await importMoonReaderData(content, fileName);
        if (updatedBooks) {
          if (onBooksUpdated) onBooksUpdated(updatedBooks);
          loadStats();
          Alert.alert('Success', 'Imported books from backup.');
        }
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not import file: ' + e.message);
    }
  };

  const backdropOpacity = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.6],
  });

  const drawerTranslateX = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-280, 0],
  });

  if (!renderDrawer) return null;

  return (
    <View style={StyleSheet.absoluteFill} zIndex={1000}>
       <Animated.View
          style={[styles.drawerBackdrop, { opacity: backdropOpacity }]}
          onStartShouldSetResponder={() => true}
          onResponderGrant={onClose}
       />
       <Animated.View style={[
          styles.drawerPane,
          {
             transform: [{ translateX: drawerTranslateX }],
             backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF'
          }
       ]}>
          <View style={[styles.drawerHeader, { borderBottomColor: isDarkMode ? '#333' : '#E0E0E0' }]}>
             <Ionicons name="library" size={32} color={COLORS.primary} />
             <Text style={[styles.drawerHeaderTitle, { color: isDarkMode ? '#FFF' : '#333' }]}>SmartReader AI</Text>
             <Text style={styles.drawerHeaderSubtitle}>Version 1.0.0</Text>
          </View>

          <ScrollView style={styles.drawerScroll}>
             {/* Reader Settings */}
             <View style={styles.drawerSectionHeader}>
                <Text style={styles.drawerSectionTitle}>Reader Settings</Text>
             </View>

             <TouchableOpacity style={styles.drawerSettingsItem} onPress={() => setFontModalVisible(true)}>
                <Ionicons name="text-outline" size={20} color={isDarkMode ? '#AAA' : '#555'} style={styles.drawerItemIcon} />
                <View style={styles.drawerItemTextContainer}>
                   <Text style={[styles.drawerItemText, { color: isDarkMode ? '#FFF' : '#333' }]}>Font Size</Text>
                   <Text style={styles.drawerItemSubtext}>{defaultFontSize}%</Text>
                </View>
             </TouchableOpacity>

             <TouchableOpacity style={styles.drawerSettingsItem} onPress={() => setThemeModalVisible(true)}>
                <Ionicons name="color-palette-outline" size={20} color={isDarkMode ? '#AAA' : '#555'} style={styles.drawerItemIcon} />
                <View style={styles.drawerItemTextContainer}>
                   <Text style={[styles.drawerItemText, { color: isDarkMode ? '#FFF' : '#333' }]}>Theme</Text>
                   <Text style={styles.drawerItemSubtext}>{readingTheme.charAt(0).toUpperCase() + readingTheme.slice(1)}</Text>
                </View>
             </TouchableOpacity>

             <TouchableOpacity style={styles.drawerSettingsItem} onPress={() => setFontFamilyModalVisible(true)}>
                <Ionicons name="language-outline" size={20} color={isDarkMode ? '#AAA' : '#555'} style={styles.drawerItemIcon} />
                <View style={styles.drawerItemTextContainer}>
                   <Text style={[styles.drawerItemText, { color: isDarkMode ? '#FFF' : '#333' }]}>Font Type</Text>
                   <Text style={styles.drawerItemSubtext}>{fontFamily}</Text>
                </View>
             </TouchableOpacity>

             <TouchableOpacity style={styles.drawerSettingsItem} onPress={() => { onClose(); navigation.navigate('CustomizeToolbar'); }}>
                <Ionicons name="construct-outline" size={20} color={isDarkMode ? '#AAA' : '#555'} style={styles.drawerItemIcon} />
                <View style={styles.drawerItemTextContainer}>
                   <Text style={[styles.drawerItemText, { color: isDarkMode ? '#FFF' : '#333' }]}>Customize Toolbar</Text>
                   <Text style={styles.drawerItemSubtext}>Change toolbar buttons</Text>
                </View>
             </TouchableOpacity>

             {/* App & Appearance */}
             <View style={styles.drawerSectionHeader}>
                <Text style={styles.drawerSectionTitle}>App & Appearance</Text>
             </View>

             <View style={styles.drawerSettingsItem}>
                <Ionicons name="moon-outline" size={20} color={isDarkMode ? '#AAA' : '#555'} style={styles.drawerItemIcon} />
                <View style={styles.drawerItemTextContainer}>
                   <Text style={[styles.drawerItemText, { color: isDarkMode ? '#FFF' : '#333' }]}>Dark Mode</Text>
                </View>
                <Switch
                   value={isDarkMode}
                   onValueChange={(val) => handleToggleSetting('darkMode', val)}
                   trackColor={{ false: '#333', true: '#3a7bd5' }}
                   thumbColor={isDarkMode ? '#FFF' : '#f4f3f4'}
                />
             </View>

             <View style={styles.drawerSettingsItem}>
                <Ionicons name="sync-outline" size={20} color={isDarkMode ? '#AAA' : '#555'} style={styles.drawerItemIcon} />
                <View style={styles.drawerItemTextContainer}>
                   <Text style={[styles.drawerItemText, { color: isDarkMode ? '#FFF' : '#333' }]}>Auto-Sync</Text>
                </View>
                <Switch
                   value={autoSync}
                   onValueChange={(val) => handleToggleSetting('autoSync', val)}
                   trackColor={{ false: '#333', true: '#3a7bd5' }}
                   thumbColor={autoSync ? '#FFF' : '#f4f3f4'}
                />
             </View>

             <View style={styles.drawerSettingsItem}>
                <Ionicons name="notifications-outline" size={20} color={isDarkMode ? '#AAA' : '#555'} style={styles.drawerItemIcon} />
                <View style={styles.drawerItemTextContainer}>
                   <Text style={[styles.drawerItemText, { color: isDarkMode ? '#FFF' : '#333' }]}>Notifications</Text>
                </View>
                <Switch
                   value={notifications}
                   onValueChange={(val) => handleToggleSetting('notifications', val)}
                   trackColor={{ false: '#333', true: '#3a7bd5' }}
                   thumbColor={notifications ? '#FFF' : '#f4f3f4'}
                />
             </View>

             {/* Data & Storage */}
             <View style={styles.drawerSectionHeader}>
                <Text style={styles.drawerSectionTitle}>Data & Storage</Text>
             </View>

             <TouchableOpacity style={styles.drawerSettingsItem} onPress={handleImportBackup}>
                <Ionicons name="cloud-download-outline" size={20} color={isDarkMode ? '#AAA' : '#555'} style={styles.drawerItemIcon} />
                <View style={styles.drawerItemTextContainer}>
                   <Text style={[styles.drawerItemText, { color: isDarkMode ? '#FFF' : '#333' }]}>Import Moon+ Backup</Text>
                   <Text style={styles.drawerItemSubtext}>Restore library</Text>
                </View>
             </TouchableOpacity>

             <TouchableOpacity style={styles.drawerSettingsItem} onPress={handleClearLibrary}>
                <Ionicons name="trash-outline" size={20} color={isDarkMode ? '#AAA' : '#555'} style={styles.drawerItemIcon} />
                <View style={styles.drawerItemTextContainer}>
                   <Text style={[styles.drawerItemText, { color: isDarkMode ? '#FFF' : '#333' }]}>Clear Library</Text>
                   <Text style={styles.drawerItemSubtext}>Remove all books</Text>
                </View>
             </TouchableOpacity>

             <TouchableOpacity style={styles.drawerSettingsItem} onPress={handleClearCache}>
                <Ionicons name="trash-bin-outline" size={20} color={isDarkMode ? '#AAA' : '#555'} style={styles.drawerItemIcon} />
                <View style={styles.drawerItemTextContainer}>
                   <Text style={[styles.drawerItemText, { color: isDarkMode ? '#FFF' : '#333' }]}>Clear Cache</Text>
                   <Text style={styles.drawerItemSubtext}>Free up storage space</Text>
                </View>
             </TouchableOpacity>
          </ScrollView>

          <View style={[styles.drawerFooter, { borderTopColor: isDarkMode ? '#333' : '#E0E0E0' }]}>
             <Text style={styles.drawerFooterTitle}>LIBRARY STATS</Text>
             <View style={styles.drawerStatsRow}>
                <Text style={styles.drawerStatsLabel}>Total Books:</Text>
                <Text style={[styles.drawerStatsValue, { color: isDarkMode ? '#FFF' : '#333' }]}>{totalBooks}</Text>
             </View>
             <View style={styles.drawerStatsRow}>
                <Text style={styles.drawerStatsLabel}>Finished:</Text>
                <Text style={[styles.drawerStatsValue, { color: isDarkMode ? '#FFF' : '#333' }]}>{finishedBooks}</Text>
             </View>
             <View style={styles.drawerStatsRow}>
                <Text style={styles.drawerStatsLabel}>Reading:</Text>
                <Text style={[styles.drawerStatsValue, { color: isDarkMode ? '#FFF' : '#333' }]}>{readingBooks}</Text>
             </View>
          </View>
       </Animated.View>

       {/* Font Size Modal */}
       <Modal visible={fontModalVisible} transparent={true} animationType="fade" onRequestClose={() => setFontModalVisible(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFontModalVisible(false)}>
             <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Default Font Size</Text>
                <View style={styles.fontControls}>
                   <TouchableOpacity onPress={() => handleSaveSetting('defaultFontSize', Math.max(50, defaultFontSize - 10))} style={styles.fontBtn}>
                      <Text style={{ color: '#FFF', fontSize: 20 }}>A-</Text>
                   </TouchableOpacity>
                   <Text style={{ color: '#FFF', fontSize: 18, marginHorizontal: 20 }}>{defaultFontSize}%</Text>
                   <TouchableOpacity onPress={() => handleSaveSetting('defaultFontSize', Math.min(200, defaultFontSize + 10))} style={styles.fontBtn}>
                      <Text style={{ color: '#FFF', fontSize: 24 }}>A+</Text>
                   </TouchableOpacity>
                </View>
             </View>
          </TouchableOpacity>
       </Modal>

       {/* Reading Theme Modal */}
       <Modal visible={themeModalVisible} transparent={true} animationType="fade" onRequestClose={() => setThemeModalVisible(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setThemeModalVisible(false)}>
             <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Background Theme</Text>
                {['light', 'dark', 'sepia'].map(theme => (
                   <TouchableOpacity
                      key={theme}
                      style={[styles.themeOption, readingTheme === theme && styles.themeOptionSelected]}
                      onPress={() => { handleSaveSetting('readingTheme', theme); setThemeModalVisible(false); }}
                   >
                      <Text style={{ color: readingTheme === theme ? '#3a7bd5' : '#FFF', fontSize: 16, textTransform: 'capitalize' }}>
                         {theme}
                      </Text>
                      {readingTheme === theme && <Ionicons name="checkmark" size={20} color="#3a7bd5" />}
                   </TouchableOpacity>
                ))}
             </View>
          </TouchableOpacity>
       </Modal>

       {/* Font Family Modal */}
       <Modal visible={fontFamilyModalVisible} transparent={true} animationType="fade" onRequestClose={() => setFontFamilyModalVisible(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFontFamilyModalVisible(false)}>
             <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select Font Type</Text>
                {['System', 'serif', 'sans-serif', 'monospace'].map(font => (
                   <TouchableOpacity
                      key={font}
                      style={[styles.themeOption, fontFamily === font && styles.themeOptionSelected]}
                      onPress={() => { handleSaveSetting('fontFamily', font); setFontFamilyModalVisible(false); }}
                   >
                      <Text style={{ color: fontFamily === font ? '#3a7bd5' : '#FFF', fontSize: 16, fontFamily: font }}>
                         {font === 'System' ? 'Default (System)' : font.charAt(0).toUpperCase() + font.slice(1)}
                      </Text>
                      {fontFamily === font && <Ionicons name="checkmark" size={20} color="#3a7bd5" />}
                   </TouchableOpacity>
                ))}
             </View>
          </TouchableOpacity>
       </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  drawerBackdrop: {
     ...StyleSheet.absoluteFillObject,
     backgroundColor: '#000000',
  },
  drawerPane: {
     position: 'absolute',
     left: 0,
     top: 0,
     bottom: 0,
     width: 280,
     elevation: 16,
     shadowColor: '#000',
     shadowOffset: { width: 4, height: 0 },
     shadowOpacity: 0.3,
     shadowRadius: 5,
     paddingTop: 40,
  },
  drawerHeader: {
     paddingHorizontal: 20,
     paddingBottom: 20,
     borderBottomWidth: 1,
  },
  drawerHeaderTitle: {
     fontSize: 22,
     fontWeight: 'bold',
     marginTop: 10,
  },
  drawerHeaderSubtitle: {
     fontSize: 12,
     color: '#888',
     marginTop: 2,
  },
  drawerScroll: {
     flex: 1,
     paddingVertical: 10,
  },
  drawerSectionHeader: {
     paddingHorizontal: 20,
     paddingTop: 15,
     paddingBottom: 5,
  },
  drawerSectionTitle: {
     fontSize: 12,
     fontWeight: 'bold',
     color: '#3a7bd5',
     letterSpacing: 1.2,
     textTransform: 'uppercase',
  },
  drawerSettingsItem: {
     flexDirection: 'row',
     alignItems: 'center',
     paddingVertical: 12,
     paddingHorizontal: 20,
     justifyContent: 'space-between',
  },
  drawerItemIcon: {
     marginRight: 12,
  },
  drawerItemTextContainer: {
     flex: 1,
  },
  drawerItemText: {
     fontSize: 15,
     fontWeight: '500',
  },
  drawerItemSubtext: {
     fontSize: 11,
     color: '#888',
     marginTop: 1,
  },
  drawerFooter: {
     padding: 20,
     borderTopWidth: 1,
  },
  drawerFooterTitle: {
     fontSize: 11,
     fontWeight: 'bold',
     color: '#888',
     letterSpacing: 1.2,
     marginBottom: 10,
  },
  drawerStatsRow: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     marginBottom: 6,
  },
  drawerStatsLabel: {
     color: '#888',
     fontSize: 13,
  },
  drawerStatsValue: {
     fontSize: 13,
     fontWeight: '600',
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
  fontControls: {
     flexDirection: 'row',
     justifyContent: 'center',
     alignItems: 'center',
     marginVertical: 10,
  },
  fontBtn: {
     width: 48,
     height: 48,
     borderRadius: 24,
     backgroundColor: '#333',
     justifyContent: 'center',
     alignItems: 'center',
  },
  themeOption: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     paddingVertical: 14,
     borderBottomWidth: 1,
     borderBottomColor: '#2A2A2A',
  },
  themeOptionSelected: {
     borderBottomColor: '#3a7bd5',
  },
});
