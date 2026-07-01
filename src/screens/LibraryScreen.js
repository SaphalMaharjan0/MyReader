import React, { useState, useEffect } from 'react';
import {
   View,
   Text,
   StyleSheet,
   FlatList,
   TouchableOpacity,
   Alert,
   TextInput,
   Keyboard,
   Image,
   Modal,
   Dimensions,
   ScrollView,
   useWindowDimensions,
   Animated,
   Switch
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import * as fflate from 'fflate';

import { COLORS, SIZES } from '../constants/theme';
import { getBooks, saveBook, removeBook, updateBook } from '../utils/storage';
import SettingsDrawer from '../components/SettingsDrawer';
import { checkAndRequestStorageAccess } from '../utils/permissions';

export default function LibraryScreen({ navigation }) {
   const [books, setBooks] = useState([]);
   const [searchQuery, setSearchQuery] = useState('');
   const [isSearching, setIsSearching] = useState(false);
   const [sortOrder, setSortOrder] = useState('date_desc');
   const [sortModalVisible, setSortModalVisible] = useState(false);
   const [dropdownVisible, setDropdownVisible] = useState(false);
   const [dropdownTab, setDropdownTab] = useState('Series');
   const [selectedSeries, setSelectedSeries] = useState(null);
   const [selectedAuthor, setSelectedAuthor] = useState(null);
   const [selectedTag, setSelectedTag] = useState(null);
   const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
   const [editModalVisible, setEditModalVisible] = useState(false);
   const [editingBook, setEditingBook] = useState(null);
   const [editTitle, setEditTitle] = useState('');
   const [editSeries, setEditSeries] = useState('');
   const [editVolume, setEditVolume] = useState('');
   const [editAuthor, setEditAuthor] = useState('');
   const [editTags, setEditTags] = useState('');
   const [isDarkMode, setIsDarkMode] = useState(true);
   const isFocused = useIsFocused();
   const [isPicking, setIsPicking] = useState(false);
   const [drawerVisible, setDrawerVisible] = useState(false);
   const [optionsModalVisible, setOptionsModalVisible] = useState(false);
   const [selectedOptionBook, setSelectedOptionBook] = useState(null);

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

   const openDrawer = () => {
      setDrawerVisible(true);
   };

   useEffect(() => {
      if (isFocused) {
         loadBooks();
      }
   }, [isFocused]);

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
         const encoded2 = lookup[base64.charCodeAt(i + 1)];
         const encoded3 = lookup[base64.charCodeAt(i + 2)];
         const encoded4 = lookup[base64.charCodeAt(i + 3)];

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

   const extractMissingCovers = async (booksList) => {
      let updatedAny = false;
      const currentBooks = [...booksList];

      for (let i = 0; i < currentBooks.length; i++) {
         const book = currentBooks[i];
         let needsExtraction = !book.coverUri;

         if (book.coverUri) {
            try {
               const fileInfo = await FileSystem.getInfoAsync(book.coverUri);
               if (!fileInfo.exists) {
                  needsExtraction = true;
               }
            } catch (e) {
               needsExtraction = true;
            }
         }

         if (needsExtraction && (book.type.includes('epub') || book.name.toLowerCase().endsWith('.epub'))) {
            try {
               let bookPath = book.uri;
               const bookFileInfo = await FileSystem.getInfoAsync(bookPath);

               if (!bookFileInfo.exists) {
                  const basename = book.uri.split('/').pop();
                  const fallbackPath = FileSystem.documentDirectory + basename;
                  const fallbackInfo = await FileSystem.getInfoAsync(fallbackPath);
                  if (fallbackInfo.exists) {
                     bookPath = fallbackPath;
                     currentBooks[i] = { ...book, uri: fallbackPath };
                     await updateBook(currentBooks[i]);
                     updatedAny = true;
                  } else {
                     continue;
                  }
               }

               const coverPath = await extractLocalCover(bookPath, book.id);
               if (coverPath) {
                  currentBooks[i] = { ...currentBooks[i], coverUri: coverPath };
                  await updateBook(currentBooks[i]);
                  updatedAny = true;
               }
            } catch (e) {
               console.log("Failed to extract missing cover locally:", e);
            }
         }
      }

      if (updatedAny) {
         setBooks(currentBooks);
      }
   };

   const loadBooks = async () => {
      const storedBooks = await getBooks();
      setBooks(storedBooks);
      setTimeout(() => {
         extractMissingCovers(storedBooks);
      }, 1500);
   };

   const extractSeries = (book) => {
      if (book.seriesName !== undefined && book.seriesName !== null && book.seriesName !== "") {
         return book.seriesName;
      } else if (book.seriesName === "") {
         return "Uncategorized";
      }
      return book.name.replace(/\.epub$/i, '').replace(/\.pdf$/i, '').replace(/(-\s*)?(vol|volume|book|part)?\s*\d+.*$/i, '').trim() || "Uncategorized";
   };

   const extractVolume = (title) => {
      const match = title.match(/(?:vol|volume|book|part)\s*(\d+(\.\d+)?)/i);
      return match ? parseFloat(match[1]) : 0;
   };

   const getUniqueSeries = () => {
      const seriesSet = new Set(books.map(b => extractSeries(b)));
      return Array.from(seriesSet).sort();
   };

   const getUniqueAuthors = () => {
      const authorSet = new Set(books.map(b => b.author && b.author.trim() ? b.author.trim() : "Unknown Author"));
      return Array.from(authorSet).sort();
   };

   const getUniqueTags = () => {
      const tagSet = new Set();
      books.forEach(b => {
         if (b.tags && b.tags.trim()) {
            b.tags.split(',').forEach(tag => tagSet.add(tag.trim()));
         }
      });
      return Array.from(tagSet).sort();
   };

   const getHeaderTitle = () => {
      if (selectedSeries) return selectedSeries;
      if (selectedAuthor) return selectedAuthor;
      if (selectedTag) return `#${selectedTag}`;
      if (showFavoritesOnly) return 'My Favorites';
      return 'All Books';
   };

   const filteredAndSortedBooks = books
      .filter(book => book.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter(book => selectedSeries ? extractSeries(book) === selectedSeries : true)
      .filter(book => selectedAuthor ? (book.author && book.author.trim() ? book.author.trim() : "Unknown Author") === selectedAuthor : true)
      .filter(book => selectedTag ? (book.tags && book.tags.split(',').map(t => t.trim()).includes(selectedTag)) : true)
      .filter(book => showFavoritesOnly ? book.isFavorite : true)
      .sort((a, b) => {
         const titleA = a.customTitle || a.name;
         const titleB = b.customTitle || b.name;

         switch (sortOrder) {
            case 'title_asc':
               return titleA.localeCompare(titleB);
            case 'series_asc': {
               const sA = extractSeries(a);
               const sB = extractSeries(b);
               if (sA !== sB) return sA.localeCompare(sB);
               const volA = a.seriesVolume !== undefined && a.seriesVolume !== '' ? parseFloat(a.seriesVolume) : extractVolume(a.name);
               const volB = b.seriesVolume !== undefined && b.seriesVolume !== '' ? parseFloat(b.seriesVolume) : extractVolume(b.name);
               return volA - volB;
            }
            case 'author_asc': {
               const aA = a.author || "Unknown";
               const aB = b.author || "Unknown";
               if (aA !== aB) return aA.localeCompare(aB);
               return titleA.localeCompare(titleB);
            }
            case 'tags_asc': {
               const tA = a.tags || "Z";
               const tB = b.tags || "Z";
               if (tA !== tB) return tA.localeCompare(tB);
               return titleA.localeCompare(titleB);
            }
            case 'volume_asc': {
               const volA = a.seriesVolume !== undefined && a.seriesVolume !== '' ? parseFloat(a.seriesVolume) : extractVolume(a.name);
               const volB = b.seriesVolume !== undefined && b.seriesVolume !== '' ? parseFloat(b.seriesVolume) : extractVolume(b.name);
               if (volA !== volB) return volA - volB;
               return titleA.localeCompare(titleB);
            }
            case 'date_desc':
            default:
               return new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0);
         }
      });

   const openSortMenu = () => {
      setSortModalVisible(true);
   };



   const handleImportBook = async () => {
      if (isPicking) return;
      setIsPicking(true);
      try {
         const result = await DocumentPicker.getDocumentAsync({
            type: '*/*', // Allow all to prevent mimetype issues on Android
            copyToCacheDirectory: true, // Crucial for Android content:// URIs
         });

         if (!result.canceled && result.assets && result.assets.length > 0) {
            const file = result.assets[0];

             // Ensure it's a supported format
             const nameLower = file.name.toLowerCase();
             const isEpub = nameLower.endsWith('.epub');
             const isPdf = nameLower.endsWith('.pdf');
             const isDoc = nameLower.endsWith('.docx') || nameLower.endsWith('.doc');
             const isPpt = nameLower.endsWith('.pptx') || nameLower.endsWith('.ppt');

             if (!isEpub && !isPdf && !isDoc && !isPpt) {
                Alert.alert('Invalid File', 'Please select a valid EPUB, PDF, Word (.doc/.docx), or PowerPoint (.ppt/.pptx) file.');
                setIsPicking(false);
                return;
             }

             // Generate a safe filename without spaces or special characters
             const safeName = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9.]/g, '_');
             const newUri = FileSystem.documentDirectory + safeName;

             // Copy from cache to permanent document directory
             await FileSystem.copyAsync({
                from: file.uri,
                to: newUri
             });

             let bookType = 'application/epub+zip';
             if (isPdf) bookType = 'application/pdf';
             else if (isDoc) bookType = nameLower.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/msword';
             else if (isPpt) bookType = nameLower.endsWith('.pptx') ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/vnd.ms-powerpoint';

             const newBook = {
                id: Date.now().toString(),
                name: file.name, // Keep original name for display
                uri: newUri,
                type: file.mimeType || bookType,
                dateAdded: new Date().toISOString(),
                coverUri: null
             };

             let importedBook = { ...newBook };
             if (importedBook.type.includes('epub') || importedBook.name.toLowerCase().endsWith('.epub')) {
                try {
                   const coverPath = await extractLocalCover(newUri, newBook.id);
                   if (coverPath) {
                      importedBook.coverUri = coverPath;
                   }
                } catch (e) {
                   console.log("Failed to extract cover locally during import", e);
                }
             }

             const updatedBooks = await saveBook(importedBook);
             setBooks(updatedBooks);

             // Auto-open the edit modal for immediate series/volume organization
             const formatExt = isPdf ? '.pdf' : (isDoc ? (nameLower.endsWith('.docx') ? '.docx' : '.doc') : (isPpt ? (nameLower.endsWith('.pptx') ? '.pptx' : '.ppt') : '.epub'));
             const displayName = importedBook.name.replace(new RegExp(formatExt + '$', 'i'), '');
             setEditingBook(importedBook);
             setEditTitle(displayName);
             const autoSeries = extractSeries(importedBook);
             setEditSeries(autoSeries === "Uncategorized" ? "" : autoSeries);
             const autoVolume = extractVolume(importedBook.name);
             setEditVolume(autoVolume ? autoVolume.toString() : "");
            setEditModalVisible(true);
         }
      } catch (err) {
         console.error('Error importing book:', err);
         Alert.alert('Error', 'Failed to import book: ' + err.message);
      } finally {
         setIsPicking(false);
      }
   };

   const handleToggleFavorite = async (book) => {
      const newBook = { ...book, isFavorite: !book.isFavorite };
      const updatedBooks = await updateBook(newBook);
      setBooks(updatedBooks);
   };

   const handleUpdateProgress = async (book, progressValue) => {
      const newBook = { ...book, progress: progressValue };
      if (progressValue === 0) {
         delete newBook.lastLocation;
      }
      const updatedBooks = await updateBook(newBook);
      setBooks(updatedBooks);
   };

   const handleBookOptions = (book) => {
      setSelectedOptionBook(book);
      setOptionsModalVisible(true);
   };

   const handleSaveBookInfo = async () => {
      if (editingBook) {
         const updatedBook = {
            ...editingBook,
            customTitle: editTitle.trim(),
            seriesName: editSeries.trim(),
            seriesVolume: editVolume.trim(),
            author: editAuthor.trim(),
            tags: editTags.trim()
         };
         const updatedBooks = await updateBook(updatedBook);
         setBooks(updatedBooks);
      }
      setEditModalVisible(false);
      setEditingBook(null);
   };

   const handleDeleteBook = async (uri) => {
      Alert.alert(
         "Delete Book",
         "Are you sure you want to remove this book from your library?",
         [
            { text: "Cancel", style: "cancel" },
            {
               text: "Delete",
               style: "destructive",
               onPress: async () => {
                  const updatedBooks = await removeBook(uri);
                  setBooks(updatedBooks);
                  // Optional: Also delete from FileSystem
                  try {
                     await FileSystem.deleteAsync(uri);
                  } catch (e) {
                     console.log("Could not delete physical file", e);
                  }
               }
            }
         ]
      );
   };

   const handleOpenBook = async (book) => {
      if (book.uri && book.uri.startsWith('file:///storage/emulated/0/')) {
         const hasPermission = await checkAndRequestStorageAccess();
         if (!hasPermission) {
            Alert.alert(
               "Permission Required",
               "SmartReader AI needs storage permission to access books stored outside the application sandbox directory. Please grant the permission in settings to open this book."
            );
            return;
         }
      }
      navigation.navigate('Reader', { book });
   };

   const getGradientColors = (title) => {
      const colors = [
         ['#2b5876', '#4e4376'],
         ['#ff9966', '#ff5e62'],
         ['#56ab2f', '#a8e063'],
         ['#141E30', '#243B55'],
         ['#000000', '#434343'],
         ['#4568DC', '#B06AB3'],
         ['#3a7bd5', '#3a6073'],
         ['#11998e', '#38ef7d']
      ];
      let hash = 0;
      for (let i = 0; i < title.length; i++) {
         hash = title.charCodeAt(i) + ((hash << 5) - hash);
      }
      const index = Math.abs(hash) % colors.length;
      return colors[index];
   };

   const renderBookItem = ({ item }) => {
      const gradient = getGradientColors(item.name);
      const displayName = item.customTitle || item.name.replace(/\.epub$/i, '').replace(/\.pdf$/i, '').replace(/\.docx$/i, '').replace(/\.doc$/i, '').replace(/\.pptx$/i, '').replace(/\.ppt$/i, '');

      return (
         <TouchableOpacity
            style={{ width: '31%', marginHorizontal: '1.1%', marginBottom: 15 }}
            onPress={() => handleOpenBook(item)}
            onLongPress={() => handleBookOptions(item)}
         >
            <View style={[styles.bookCard, { width: '100%' }]}>
               <View style={[styles.bookCoverPlaceholder, { backgroundColor: gradient[0] }]}>
                  {item.coverUri ? (
                     <Image source={{ uri: item.coverUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                  ) : (
                     <Text style={styles.bookCoverTitle} numberOfLines={4}>{displayName}</Text>
                  )}

                  <TouchableOpacity
                     style={styles.bookActionDots}
                     onPress={() => handleBookOptions(item)}
                  >
                     <Ionicons name="ellipsis-vertical" size={16} color="#FFF" />
                  </TouchableOpacity>

                  <View style={styles.bookProgressOverlay}>
                     <Text style={styles.bookProgressText}>{item.progress ? Math.round(item.progress * 100) : 0}%</Text>
                  </View>

                  {item.isFavorite && (
                     <View style={{ position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 3 }}>
                        <Ionicons name="heart" size={16} color="#e74c3c" />
                     </View>
                  )}
               </View>
            </View>
            <Text style={{ color: isDarkMode ? '#FFF' : '#333', fontSize: 11, fontWeight: '600', marginTop: 4, textAlign: 'center' }} numberOfLines={1}>
               {displayName}
            </Text>
            {item.seriesName ? (
               <Text style={{ color: '#888', fontSize: 9, textAlign: 'center', marginTop: 1 }} numberOfLines={1}>
                  {item.seriesName} {item.seriesVolume ? `Vol. ${item.seriesVolume}` : ''}
               </Text>
            ) : null}
         </TouchableOpacity>
      );
   };

   return (
      <SafeAreaView style={[styles.container, !isDarkMode && { backgroundColor: '#F5F5F5' }]}>
         <View style={[styles.header, !isDarkMode && { backgroundColor: '#F5F5F5', borderBottomColor: '#E0E0E0' }]}>
            {isSearching ? (
               <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity style={{ padding: 5 }} onPress={() => { setIsSearching(false); setSearchQuery(''); Keyboard.dismiss(); }}>
                     <Ionicons name="arrow-back" size={28} color="#FFF" />
                  </TouchableOpacity>
                  <TextInput
                     style={{ flex: 1, color: '#FFF', fontSize: 18, marginLeft: 10 }}
                     placeholder="Search library..."
                     placeholderTextColor="#AAA"
                     value={searchQuery}
                     onChangeText={setSearchQuery}
                     autoFocus
                  />
                  {searchQuery.length > 0 && (
                     <TouchableOpacity style={{ padding: 5 }} onPress={() => setSearchQuery('')}>
                        <Ionicons name="close-circle" size={20} color="#AAA" />
                     </TouchableOpacity>
                  )}
               </View>
            ) : (
               <>
                  <TouchableOpacity style={{ padding: 5 }} onPress={openDrawer}>
                     <Ionicons name="menu" size={28} color={isDarkMode ? '#FFF' : '#333'} />
                  </TouchableOpacity>

                  <View style={{ flex: 1, marginLeft: 15 }}>
                     <TouchableOpacity onPress={() => setDropdownVisible(!dropdownVisible)} style={{ flexDirection: 'row', alignItems: 'center', maxWidth: '95%' }}>
                        <Text style={{ fontSize: 20, fontWeight: 'bold', color: isDarkMode ? '#FFF' : '#333', flexShrink: 1 }} numberOfLines={1}>
                           {getHeaderTitle()}
                        </Text>
                        <Ionicons name={dropdownVisible ? "caret-up" : "caret-down"} size={16} color={isDarkMode ? '#FFF' : '#333'} style={{ marginLeft: 5, flexShrink: 0 }} />
                     </TouchableOpacity>
                     <Text style={{ fontSize: 12, color: '#AAA' }} numberOfLines={1}>
                        {showFavoritesOnly ? 'Filtered by Favorites' : selectedSeries ? 'Filtered by Series' : (books.length > 0 ? books[0].name.replace('.epub', '') : 'No recent books')}
                     </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                     <TouchableOpacity style={{ padding: 8 }} onPress={() => setIsSearching(true)}><Ionicons name="search" size={24} color={isDarkMode ? "#FFF" : "#333"} /></TouchableOpacity>
                     <TouchableOpacity style={{ padding: 8 }} onPress={openSortMenu}><Ionicons name="funnel-outline" size={24} color={isDarkMode ? "#FFF" : "#333"} /></TouchableOpacity>
                     <TouchableOpacity style={{ padding: 8 }} onPress={() => Alert.alert("Options", "Library Settings coming soon!")}><Ionicons name="ellipsis-vertical" size={24} color={isDarkMode ? "#FFF" : "#333"} /></TouchableOpacity>
                  </View>
               </>
            )}
         </View>

         <Modal visible={dropdownVisible} transparent={true} animationType="fade" onRequestClose={() => setDropdownVisible(false)}>
            <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={() => setDropdownVisible(false)}>
               <View style={{ marginTop: 60, alignSelf: 'center', width: '95%', height: '60%', backgroundColor: '#1A1A1A', borderRadius: 8, flexDirection: 'row', overflow: 'hidden', elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.5 }}>

                  {/* Left Pane */}
                  <View style={{ width: 140, backgroundColor: '#111', paddingVertical: 10 }}>
                     {['All Books', 'My Favorites', 'Series', 'Authors', 'Tags', 'Storage Folder'].map((tab) => (
                        <TouchableOpacity key={tab} onPress={() => setDropdownTab(tab)} style={{ padding: 15, backgroundColor: dropdownTab === tab ? '#222' : 'transparent', borderRightWidth: dropdownTab === tab ? 3 : 0, borderRightColor: '#FFF' }}>
                           <Text style={{ color: dropdownTab === tab ? '#FFF' : '#AAA', fontWeight: dropdownTab === tab ? 'bold' : 'normal', fontSize: 16 }}>{tab}</Text>
                        </TouchableOpacity>
                     ))}
                  </View>

                  {/* Right Pane */}
                  <View style={{ flex: 1, backgroundColor: '#1A1A1A', padding: 10 }}>
                     {dropdownTab === 'Series' ? (
                        <FlatList
                           data={getUniqueSeries()}
                           keyExtractor={(item) => item}
                           renderItem={({ item }) => (
                              <TouchableOpacity
                                 onPress={() => { setSelectedSeries(item); setSelectedAuthor(null); setSelectedTag(null); setShowFavoritesOnly(false); setSortOrder('volume_asc'); setDropdownVisible(false); }}
                                 style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#333' }}
                              >
                                 <Text style={{ color: '#FFF', fontSize: 16, flex: 1 }} numberOfLines={2}>{item}</Text>
                                 <Ionicons name="library" size={20} color="#888" style={{ marginLeft: 10 }} />
                                 <Ionicons name="ellipsis-vertical" size={20} color="#888" style={{ marginLeft: 15 }} />
                              </TouchableOpacity>
                           )}
                        />
                     ) : dropdownTab === 'Authors' ? (
                        <FlatList
                           data={getUniqueAuthors()}
                           keyExtractor={(item) => item}
                           renderItem={({ item }) => (
                              <TouchableOpacity
                                 onPress={() => { setSelectedSeries(null); setSelectedAuthor(item); setSelectedTag(null); setShowFavoritesOnly(false); setDropdownVisible(false); }}
                                 style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#333' }}
                              >
                                 <Text style={{ color: '#FFF', fontSize: 16, flex: 1 }} numberOfLines={2}>{item}</Text>
                                 <Ionicons name="person" size={20} color="#888" style={{ marginLeft: 10 }} />
                              </TouchableOpacity>
                           )}
                        />
                     ) : dropdownTab === 'Tags' ? (
                        <FlatList
                           data={getUniqueTags()}
                           keyExtractor={(item) => item}
                           renderItem={({ item }) => (
                              <TouchableOpacity
                                 onPress={() => { setSelectedSeries(null); setSelectedAuthor(null); setSelectedTag(item); setShowFavoritesOnly(false); setDropdownVisible(false); }}
                                 style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#333' }}
                              >
                                 <Text style={{ color: '#FFF', fontSize: 16, flex: 1 }} numberOfLines={2}>#{item}</Text>
                                 <Ionicons name="pricetag" size={20} color="#888" style={{ marginLeft: 10 }} />
                              </TouchableOpacity>
                           )}
                        />
                     ) : dropdownTab === 'All Books' ? (
                        <TouchableOpacity
                           onPress={() => { setSelectedSeries(null); setSelectedAuthor(null); setSelectedTag(null); setShowFavoritesOnly(false); setDropdownVisible(false); }}
                           style={{ paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#333' }}
                        >
                           <Text style={{ color: '#FFF', fontSize: 16 }}>Show All Loaded Books</Text>
                        </TouchableOpacity>
                     ) : dropdownTab === 'My Favorites' ? (
                        <TouchableOpacity
                           onPress={() => { setSelectedSeries(null); setSelectedAuthor(null); setSelectedTag(null); setShowFavoritesOnly(true); setDropdownVisible(false); }}
                           style={{ paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#333' }}
                        >
                           <Text style={{ color: '#FFF', fontSize: 16 }}>Filter by Favorites</Text>
                        </TouchableOpacity>
                     ) : (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                           <Text style={{ color: '#555' }}>Coming Soon</Text>
                        </View>
                     )}
                  </View>

               </View>
            </TouchableOpacity>
         </Modal>

         <Modal visible={editModalVisible} transparent={true} animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
               <View style={{ width: '85%', maxHeight: '100%', backgroundColor: '#1A1A1A', borderRadius: 12, padding: 20, elevation: 5 }}>
                  <Text style={{ color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 20 }}>Edit Book Info</Text>

                  <ScrollView style={{ maxHeight: '75%' }}>
                     {editingBook && (
                        <View style={{ alignItems: 'center', marginBottom: 20 }}>
                           {editingBook.coverUri ? (
                              <Image
                                 source={{ uri: editingBook.coverUri }}
                                 style={{ width: 120, height: 180, borderRadius: 8, backgroundColor: '#222' }}
                                 resizeMode="cover"
                              />
                           ) : (
                              <View style={{ width: 120, height: 180, borderRadius: 8, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#333' }}>
                                 <Ionicons name="book-outline" size={48} color="#666" />
                                 <Text style={{ color: '#666', fontSize: 11, marginTop: 10, textAlign: 'center', paddingHorizontal: 10 }} numberOfLines={2}>
                                    {editTitle || 'No Cover'}
                                 </Text>
                              </View>
                           )}
                        </View>
                     )}
                     <Text style={{ color: '#AAA', fontSize: 14, marginBottom: 5 }}>Title</Text>
                     <TextInput
                        style={{ backgroundColor: '#222', color: '#FFF', padding: 12, borderRadius: 8, marginBottom: 15 }}
                        value={editTitle}
                        onChangeText={setEditTitle}
                        placeholder="Book Title"
                        placeholderTextColor="#666"
                     />

                     <Text style={{ color: '#AAA', fontSize: 14, marginBottom: 5 }}>Series Name</Text>
                     <TextInput
                        style={{ backgroundColor: '#222', color: '#FFF', padding: 12, borderRadius: 8, marginBottom: 15 }}
                        value={editSeries}
                        onChangeText={setEditSeries}
                        placeholder="e.g. Harry Potter (Leave blank for none)"
                        placeholderTextColor="#666"
                     />

                     <Text style={{ color: '#AAA', fontSize: 14, marginBottom: 5 }}>Volume / Book Number</Text>
                     <TextInput
                        style={{ backgroundColor: '#222', color: '#FFF', padding: 12, borderRadius: 8, marginBottom: 15 }}
                        value={editVolume}
                        onChangeText={setEditVolume}
                        placeholder="e.g. 1"
                        placeholderTextColor="#666"
                        keyboardType="numeric"
                     />

                     <Text style={{ color: '#AAA', fontSize: 14, marginBottom: 5 }}>Author</Text>
                     <TextInput
                        style={{ backgroundColor: '#222', color: '#FFF', padding: 12, borderRadius: 8, marginBottom: 15 }}
                        value={editAuthor}
                        onChangeText={setEditAuthor}
                        placeholder="e.g. J.K. Rowling"
                        placeholderTextColor="#666"
                     />

                     <Text style={{ color: '#AAA', fontSize: 14, marginBottom: 5 }}>Tags (comma separated)</Text>
                     <TextInput
                        style={{ backgroundColor: '#222', color: '#FFF', padding: 12, borderRadius: 8, marginBottom: 25 }}
                        value={editTags}
                        onChangeText={setEditTags}
                        placeholder="e.g. Fantasy, Magic, Adventure"
                        placeholderTextColor="#666"
                     />
                  </ScrollView>

                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 15 }}>
                     <TouchableOpacity onPress={() => setEditModalVisible(false)} style={{ padding: 10, marginRight: 15 }}>
                        <Text style={{ color: '#AAA', fontSize: 16 }}>Cancel</Text>
                     </TouchableOpacity>
                     <TouchableOpacity onPress={handleSaveBookInfo} style={{ padding: 10, backgroundColor: '#3a7bd5', borderRadius: 8, paddingHorizontal: 20 }}>
                        <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold' }}>Save</Text>
                     </TouchableOpacity>
                  </View>
               </View>
            </View>
         </Modal>

         {books.length === 0 ? (
            <View style={styles.emptyState}>
               <Ionicons name="library-outline" size={64} color="#555" />
               <Text style={[styles.emptyText, !isDarkMode && { color: '#333' }]}>Your library is empty.</Text>
               <Text style={styles.emptySubText}>Tap the + button to import a book.</Text>
            </View>
         ) : (
            <FlatList
               data={filteredAndSortedBooks}
               keyExtractor={(item) => item.id}
               renderItem={renderBookItem}
               numColumns={3}
               contentContainerStyle={[styles.listContainer, !isDarkMode && { backgroundColor: '#F5F5F5' }]}
               columnWrapperStyle={styles.row}
            />
         )}

         <TouchableOpacity
            style={[styles.fab, { zIndex: 100 }, isPicking && { opacity: 0.6 }]}
            onPress={handleImportBook}
            disabled={isPicking}
         >
            <Ionicons name="add" size={34} color="#FFF" />
         </TouchableOpacity>


         <Modal visible={sortModalVisible} transparent={true} animationType="fade" onRequestClose={() => setSortModalVisible(false)}>
            <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setSortModalVisible(false)}>
               <View style={{ backgroundColor: '#1A1A1A', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 }}>
                  <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 20 }}>Sort Library By</Text>

                  {[
                     { id: 'date_desc', label: 'Recently Added', icon: 'time-outline' },
                     { id: 'title_asc', label: 'Alphabetical (Title)', icon: 'text-outline' },
                     { id: 'series_asc', label: 'Series Name', icon: 'library-outline' },
                     { id: 'author_asc', label: 'Author', icon: 'person-outline' },
                     { id: 'tags_asc', label: 'Tags', icon: 'pricetag-outline' },
                     { id: 'volume_asc', label: 'Volume Number', icon: 'list-outline' }
                  ].map((option) => (
                     <TouchableOpacity
                        key={option.id}
                        onPress={() => { setSortOrder(option.id); setSortModalVisible(false); }}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#333' }}
                     >
                        <Ionicons name={option.icon} size={24} color={sortOrder === option.id ? "#3a7bd5" : "#AAA"} style={{ marginRight: 15 }} />
                        <Text style={{ color: sortOrder === option.id ? '#3a7bd5' : '#FFF', fontSize: 16, flex: 1 }}>{option.label}</Text>
                        {sortOrder === option.id && <Ionicons name="checkmark" size={24} color="#3a7bd5" />}
                     </TouchableOpacity>
                  ))}
               </View>
            </TouchableOpacity>
         </Modal>

         {/* Navigation Drawer Overlay */}
         <SettingsDrawer
            visible={drawerVisible}
            onClose={() => setDrawerVisible(false)}
            navigation={navigation}
            onBooksUpdated={(updated) => setBooks(updated)}
         />

         {/* Book Options Bottom Sheet Modal */}
         <Modal visible={optionsModalVisible} transparent={true} animationType="slide" onRequestClose={() => setOptionsModalVisible(false)}>
            <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setOptionsModalVisible(false)}>
               <View style={{ backgroundColor: '#1E1E1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 }}>
                  {selectedOptionBook && (
                     <>
                        <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' }}>
                           {selectedOptionBook.customTitle || selectedOptionBook.name.replace(/\.epub$/i, '').replace(/\.pdf$/i, '')}
                        </Text>

                        <TouchableOpacity
                           style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' }}
                           onPress={() => {
                              setOptionsModalVisible(false);
                              handleOpenBook(selectedOptionBook);
                           }}
                        >
                           <Ionicons name="book-outline" size={24} color="#3a7bd5" style={{ marginRight: 15 }} />
                           <Text style={{ color: '#FFF', fontSize: 16 }}>Open Book</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                           style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' }}
                           onPress={() => {
                              setOptionsModalVisible(false);
                              handleToggleFavorite(selectedOptionBook);
                           }}
                        >
                           <Ionicons name={selectedOptionBook.isFavorite ? "heart-dislike-outline" : "heart-outline"} size={24} color="#e74c3c" style={{ marginRight: 15 }} />
                           <Text style={{ color: '#FFF', fontSize: 16 }}>
                              {selectedOptionBook.isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                           </Text>
                        </TouchableOpacity>

                        {(selectedOptionBook.progress || 0) < 1 && (
                           <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' }}
                              onPress={() => {
                                 setOptionsModalVisible(false);
                                 handleUpdateProgress(selectedOptionBook, 1.0);
                              }}
                           >
                              <Ionicons name="checkmark-done-outline" size={24} color="#38ef7d" style={{ marginRight: 15 }} />
                              <Text style={{ color: '#FFF', fontSize: 16 }}>Mark as Finished</Text>
                           </TouchableOpacity>
                        )}

                        {(selectedOptionBook.progress || 0) > 0 && (
                           <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' }}
                              onPress={() => {
                                 setOptionsModalVisible(false);
                                 handleUpdateProgress(selectedOptionBook, 0.0);
                              }}
                           >
                              <Ionicons name="refresh-outline" size={24} color="#ff9966" style={{ marginRight: 15 }} />
                              <Text style={{ color: '#FFF', fontSize: 16 }}>Reset Reading Progress</Text>
                           </TouchableOpacity>
                        )}

                        <TouchableOpacity
                           style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' }}
                           onPress={() => {
                              setOptionsModalVisible(false);
                              const displayName = selectedOptionBook.customTitle || selectedOptionBook.name.replace(/\.epub$/i, '').replace(/\.pdf$/i, '');
                              setEditingBook(selectedOptionBook);
                              setEditTitle(displayName);
                              const currentSeries = extractSeries(selectedOptionBook);
                              setEditSeries(currentSeries === "Uncategorized" ? "" : currentSeries);
                              setEditVolume(selectedOptionBook.seriesVolume !== undefined ? selectedOptionBook.seriesVolume.toString() : "");
                              setEditAuthor(selectedOptionBook.author || "");
                              setEditTags(selectedOptionBook.tags || "");
                              setEditModalVisible(true);
                           }}
                        >
                           <Ionicons name="create-outline" size={24} color="#3a7bd5" style={{ marginRight: 15 }} />
                           <Text style={{ color: '#FFF', fontSize: 16 }}>Edit</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                           style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' }}
                           onPress={() => {
                              setOptionsModalVisible(false);
                              handleDeleteBook(selectedOptionBook.uri);
                           }}
                        >
                           <Ionicons name="trash-outline" size={24} color="#e74c3c" style={{ marginRight: 15 }} />
                           <Text style={{ color: '#e74c3c', fontSize: 16, fontWeight: 'bold' }}>Delete Book</Text>
                        </TouchableOpacity>
                     </>
                  )}
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
   emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: SIZES.large,
   },
   emptyText: {
      fontSize: SIZES.large,
      fontWeight: 'bold',
      color: '#FFF',
      marginTop: SIZES.medium,
   },
   emptySubText: {
      fontSize: SIZES.font,
      color: '#AAA',
      marginTop: SIZES.base,
   },
   listContainer: {
      padding: 10,
      backgroundColor: '#121212',
      paddingBottom: 100,
   },
   row: {
      justifyContent: 'flex-start',
      marginBottom: 10,
   },
   bookCard: {
      aspectRatio: 0.65,
      backgroundColor: '#222',
      borderRadius: 8,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 3,
      elevation: 3,
   },
   bookCoverPlaceholder: {
      flex: 1,
      padding: 10,
      justifyContent: 'center',
      alignItems: 'center',
   },
   bookCoverTitle: {
      color: '#FFF',
      fontSize: 16,
      fontWeight: 'bold',
      textAlign: 'center',
      textShadowColor: 'rgba(0, 0, 0, 0.75)',
      textShadowOffset: { width: -1, height: 1 },
      textShadowRadius: 10
   },
   bookActionDots: {
      position: 'absolute',
      bottom: 5,
      left: 5,
      padding: 5,
   },
   bookProgressOverlay: {
      position: 'absolute',
      bottom: 5,
      right: 5,
      backgroundColor: 'rgba(0,0,0,0.6)',
      borderRadius: 20,
      paddingHorizontal: 8,
      paddingVertical: 4,
   },
   bookProgressText: {
      color: '#FFF',
      fontSize: 10,
      fontWeight: 'bold',
   },
   fab: {
      position: 'absolute',
      bottom: 30,
      right: 30,
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: '#3a7bd5',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 5,
   },
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
   drawerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 15,
      paddingHorizontal: 20,
   },
   drawerItemIcon: {
      marginRight: 15,
   },
   drawerItemText: {
      fontSize: 16,
      fontWeight: '500',
   },
   drawerDivider: {
      height: 1,
      marginVertical: 10,
      marginHorizontal: 20,
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
      fontSize: 14,
   },
   drawerStatsValue: {
      fontSize: 14,
      fontWeight: 'bold',
   },
   drawerSectionHeader: {
      paddingHorizontal: 20,
      marginTop: 15,
      marginBottom: 5,
   },
   drawerSectionTitle: {
      fontSize: 12,
      fontWeight: 'bold',
      color: '#888',
      textTransform: 'uppercase',
      letterSpacing: 1.1,
   },
   drawerSettingsItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 20,
   },
   drawerItemTextContainer: {
      flex: 1,
   },
   drawerItemSubtext: {
      fontSize: 12,
      color: '#888',
      marginTop: 1,
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
      alignItems: 'center',
      justifyContent: 'center',
   },
   fontBtn: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: '#3a7bd5',
      alignItems: 'center',
      justifyContent: 'center',
   },
   themeOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: '#2A2A2A',
   },
   themeOptionSelected: {
      borderBottomColor: '#3a7bd5',
   },
});
