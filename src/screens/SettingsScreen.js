import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, SafeAreaView, Platform, StatusBar, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { useNavigation } from '@react-navigation/native';
import { getSettings, updateSettings, clearBooks } from '../utils/storage';
import * as FileSystem from 'expo-file-system/legacy';

const SettingsItem = ({ icon, title, subtitle, value, type, onPress, onToggle, isDark }) => {
  return (
    <TouchableOpacity 
      style={[styles.itemContainer, !isDark && styles.lightBorder]} 
      onPress={onPress} 
      disabled={type === 'switch'}
      activeOpacity={0.7}
    >
      <View style={[styles.itemIconContainer, !isDark && { backgroundColor: 'rgba(47, 60, 126, 0.1)' }]}>
        <Ionicons name={icon} size={22} color={isDark ? COLORS.secondary : COLORS.primary} />
      </View>
      <View style={styles.itemTextContainer}>
        <Text style={[styles.itemTitle, { color: isDark ? COLORS.darkText : COLORS.text }]}>{title}</Text>
        {subtitle && <Text style={[styles.itemSubtitle, { color: isDark ? COLORS.textLight : '#666' }]}>{subtitle}</Text>}
      </View>
      <View style={styles.itemActionContainer}>
        {type === 'switch' ? (
          <Switch
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
            thumbColor={value ? '#fff' : '#f4f3f4'}
            ios_backgroundColor={COLORS.border}
            value={value}
            onValueChange={onToggle}
          />
        ) : type === 'navigate' ? (
          <Ionicons name="chevron-forward" size={20} color={isDark ? COLORS.textLight : '#999'} />
        ) : type === 'text' ? (
          <Text style={[styles.itemValue, { color: isDark ? COLORS.textLight : '#666' }]}>{value}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

export default function SettingsScreen() {
  const navigation = useNavigation();
  const [darkMode, setDarkMode] = useState(true);
  const [autoSync, setAutoSync] = useState(false);
  const [notifications, setNotifications] = useState(true);
  
  // New features
  const [readingTheme, setReadingTheme] = useState('dark');
  const [defaultFontSize, setDefaultFontSize] = useState(100);
  const [fontFamily, setFontFamily] = useState('System');
  const [fontModalVisible, setFontModalVisible] = useState(false);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [fontFamilyModalVisible, setFontFamilyModalVisible] = useState(false);
  const [isPicking, setIsPicking] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getSettings();
      setDarkMode(settings.darkMode);
      setAutoSync(settings.autoSync);
      setNotifications(settings.notifications);
      if (settings.readingTheme) setReadingTheme(settings.readingTheme);
      if (settings.defaultFontSize) setDefaultFontSize(settings.defaultFontSize);
      if (settings.fontFamily) setFontFamily(settings.fontFamily);
    };
    loadSettings();
  }, []);

  const handleToggle = async (key, value) => {
    if (key === 'darkMode') setDarkMode(value);
    if (key === 'autoSync') setAutoSync(value);
    if (key === 'notifications') setNotifications(value);
    
    await updateSettings({ [key]: value });
  };

  const handleSaveSetting = async (key, value) => {
    if (key === 'readingTheme') setReadingTheme(value);
    if (key === 'defaultFontSize') setDefaultFontSize(value);
    if (key === 'fontFamily') setFontFamily(value);
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

  const handleFeatureAlert = (featureName) => {
    Alert.alert(featureName, `Settings for ${featureName} will be available in a future update.`);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkMode ? COLORS.darkBackground : COLORS.background }]}>
      <View style={[styles.header, { backgroundColor: darkMode ? COLORS.darkBackground : COLORS.background }]}>
        <Text style={[styles.headerTitle, { color: darkMode ? COLORS.darkText : COLORS.text }]}>Settings</Text>
      </View>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        
        <Text style={[styles.sectionTitle, { color: darkMode ? COLORS.textLight : '#666' }]}>Reader</Text>
        <View style={[styles.sectionContainer, !darkMode && styles.lightCard]}>
          <SettingsItem 
            icon="construct-outline" 
            title="Customize Toolbar" 
            subtitle="Change reader navigation bar layout"
            type="navigate"
            onPress={() => navigation.navigate('CustomizeToolbar')}
            isDark={darkMode}
          />
          <SettingsItem 
            icon="text-outline" 
            title="Default Font Size" 
            value={`${defaultFontSize}%`}
            type="text"
            onPress={() => setFontModalVisible(true)}
            isDark={darkMode}
          />
          <SettingsItem 
            icon="color-palette-outline" 
            title="Background Theme" 
            value={readingTheme.charAt(0).toUpperCase() + readingTheme.slice(1)}
            type="text"
            onPress={() => setThemeModalVisible(true)}
            isDark={darkMode}
          />
          <SettingsItem 
            icon="language-outline" 
            title="Font Type" 
            value={fontFamily}
            type="text"
            onPress={() => setFontFamilyModalVisible(true)}
            isDark={darkMode}
          />
        </View>

        <Text style={[styles.sectionTitle, { color: darkMode ? COLORS.textLight : '#666' }]}>Appearance & App</Text>
        <View style={[styles.sectionContainer, !darkMode && styles.lightCard]}>
          <SettingsItem 
            icon="moon-outline" 
            title="Dark Mode" 
            type="switch"
            value={darkMode}
            onToggle={(val) => handleToggle('darkMode', val)}
            isDark={darkMode}
          />
          <SettingsItem 
            icon="sync-outline" 
            title="Auto-Sync Library" 
            subtitle="Sync progress across devices"
            type="switch"
            value={autoSync}
            onToggle={(val) => handleToggle('autoSync', val)}
            isDark={darkMode}
          />
          <SettingsItem 
            icon="notifications-outline" 
            title="Notifications" 
            type="switch"
            value={notifications}
            onToggle={(val) => handleToggle('notifications', val)}
            isDark={darkMode}
          />
        </View>

        <Text style={[styles.sectionTitle, { color: darkMode ? COLORS.textLight : '#666' }]}>Data & Storage</Text>
        <View style={[styles.sectionContainer, !darkMode && styles.lightCard]}>
          <SettingsItem 
            icon="trash-outline" 
            title="Clear Library" 
            subtitle="Remove all books from your library list"
            type="navigate"
            onPress={() => {
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
                        Alert.alert('Success', 'Library has been cleared.');
                      } else {
                        Alert.alert('Error', 'Could not clear library.');
                      }
                    }
                  }
                ]
              );
            }}
            isDark={darkMode}
          />
          <SettingsItem 
            icon="trash-bin-outline" 
            title="Clear Cache" 
            subtitle="Free up space from temporary files"
            type="navigate"
            onPress={handleClearCache}
            isDark={darkMode}
          />
          <SettingsItem 
            icon="cloud-download-outline" 
            title="Import Moon+ Backup" 
            subtitle="Import from .mrpro or .txt"
            type="navigate"
            onPress={async () => {
              if (isPicking) return;
              setIsPicking(true);
              try {
                const DocumentPicker = require('expo-document-picker');
                const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
                if (!result.canceled && result.assets && result.assets.length > 0) {
                  const fileUri = result.assets[0].uri;
                  const fileName = result.assets[0].name.toLowerCase();
                  
                  const isBase64 = fileName.endsWith('.mrpro') || fileName.endsWith('.zip');
                  const content = await FileSystem.readAsStringAsync(fileUri, isBase64 ? { encoding: FileSystem.EncodingType.Base64 } : {});
                  
                  const { importMoonReaderData } = require('../utils/storage');
                  await importMoonReaderData(content, fileName);
                  Alert.alert('Success', 'Imported books from Moon+ Reader backup.');
                }
              } catch (e) {
                console.error(e);
                Alert.alert('Error', 'Could not import file: ' + e.message);
              } finally {
                setIsPicking(false);
              }
            }}
            isDark={darkMode}
          />
          <SettingsItem 
            icon="cloud-download-outline" 
            title="Export Backup" 
            type="navigate"
            onPress={() => handleFeatureAlert('Export Backup')}
            isDark={darkMode}
          />
        </View>

        <Text style={[styles.sectionTitle, { color: darkMode ? COLORS.textLight : '#666' }]}>About</Text>
        <View style={[styles.sectionContainer, !darkMode && styles.lightCard]}>
          <SettingsItem 
            icon="information-circle-outline" 
            title="Version" 
            type="text"
            value="1.0.0"
            isDark={darkMode}
          />
          <SettingsItem 
            icon="star-outline" 
            title="Rate the App" 
            type="navigate"
            onPress={() => Alert.alert('Rate the App', 'Thank you for using our app! App store ratings will be enabled upon release.')}
            isDark={darkMode}
          />
        </View>
        
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Font Size Modal */}
      <Modal visible={fontModalVisible} transparent={true} animationType="fade" onRequestClose={() => setFontModalVisible(false)}>
         <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFontModalVisible(false)}>
            <View style={styles.modalContent}>
               <Text style={styles.modalTitle}>Default Font Size</Text>
               <View style={styles.fontControls}>
                  <TouchableOpacity onPress={() => handleSaveSetting('defaultFontSize', Math.max(50, defaultFontSize - 10))} style={styles.fontBtn}>
                     <Text style={{color: COLORS.darkText, fontSize: 20}}>A-</Text>
                  </TouchableOpacity>
                  <Text style={{color: COLORS.darkText, fontSize: 18, marginHorizontal: 20}}>{defaultFontSize}%</Text>
                  <TouchableOpacity onPress={() => handleSaveSetting('defaultFontSize', Math.min(200, defaultFontSize + 10))} style={styles.fontBtn}>
                     <Text style={{color: COLORS.darkText, fontSize: 24}}>A+</Text>
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
                     <Text style={{color: readingTheme === theme ? COLORS.primary : COLORS.darkText, fontSize: 16, textTransform: 'capitalize'}}>
                        {theme}
                     </Text>
                     {readingTheme === theme && <Ionicons name="checkmark" size={20} color={COLORS.primary} />}
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
                     <Text style={{color: fontFamily === font ? COLORS.primary : COLORS.darkText, fontSize: 16, fontFamily: font}}>
                        {font === 'System' ? 'Default (System)' : font.charAt(0).toUpperCase() + font.slice(1)}
                     </Text>
                     {fontFamily === font && <Ionicons name="checkmark" size={20} color={COLORS.primary} />}
                  </TouchableOpacity>
               ))}
            </View>
         </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.darkBackground,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: COLORS.darkBackground,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.darkText,
    letterSpacing: 0.5,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 24,
    paddingLeft: 12,
  },
  sectionContainer: {
    backgroundColor: COLORS.darkCard,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2A2A2A', // Fixes Android clipping bug + looks premium
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  itemIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(47, 60, 126, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  itemTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.darkText,
    marginBottom: 2,
  },
  itemSubtitle: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  itemActionContainer: {
    paddingLeft: 12,
    justifyContent: 'center',
  },
  itemValue: {
    fontSize: 16,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  bottomSpacer: {
    height: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    backgroundColor: COLORS.darkCard,
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.darkText,
    marginBottom: 20,
    textAlign: 'center',
  },
  fontControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  fontBtn: {
    padding: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    minWidth: 60,
    alignItems: 'center',
  },
  themeOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  themeOptionSelected: {
    backgroundColor: 'rgba(47, 60, 126, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 0,
  },
  lightText: {
    color: '#666',
  },
  lightCard: {
    backgroundColor: '#FFF',
    borderColor: '#E0E0E0',
    borderWidth: 1,
  },
  lightBorder: {
    borderBottomColor: '#E0E0E0',
  }
});
