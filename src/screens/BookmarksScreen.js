import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  Modal, 
  TextInput, 
  Alert, 
  ScrollView 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { COLORS, SIZES } from '../constants/theme';
import { 
  getSettings, 
  subscribeToSettings, 
  getBookmarks, 
  saveBookmark, 
  removeBookmark, 
  getBooks 
} from '../utils/storage';
import SettingsDrawer from '../components/SettingsDrawer';

export default function BookmarksScreen({ navigation }) {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  const [libraryBooks, setLibraryBooks] = useState([]);
  const isFocused = useIsFocused();

  // Note Modal States
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [selectedBook, setSelectedBook] = useState(null); // { id, name }
  const [showBookDropdown, setShowBookDropdown] = useState(false);

  // Load theme settings dynamically
  useEffect(() => {
    const loadInitial = async () => {
      const settings = await getSettings();
      if (settings) setIsDarkMode(settings.darkMode);
    };
    loadInitial();

    const unsubscribe = subscribeToSettings((newSettings) => {
      setIsDarkMode(newSettings.darkMode);
    });
    return unsubscribe;
  }, []);

  // Fetch bookmarks and library books on focus
  useEffect(() => {
    if (isFocused) {
      loadData();
    }
  }, [isFocused]);

  const loadData = async () => {
    try {
      const bmarks = await getBookmarks();
      // Sort newest first
      bmarks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setBookmarks(bmarks);

      const books = await getBooks();
      setLibraryBooks(books);
    } catch(e) {
      console.log('Error loading bookmarks page data', e);
    }
  };

  const handleOpenAddNote = () => {
    setEditingNote(null);
    setNoteText('');
    setSelectedBook(null);
    setShowBookDropdown(false);
    setNoteModalVisible(true);
  };

  const handleOpenEditNote = (item) => {
    setEditingNote(item);
    setNoteText(item.note);
    if (item.bookId) {
      setSelectedBook({ id: item.bookId, name: item.bookName });
    } else {
      setSelectedBook(null);
    }
    setShowBookDropdown(false);
    setNoteModalVisible(true);
  };

  const handleSaveNote = async () => {
    if (!noteText.trim()) {
      Alert.alert('Error', 'Please enter your note text.');
      return;
    }

    try {
      const newNote = {
        id: editingNote ? editingNote.id : 'note_' + Date.now(),
        bookId: selectedBook ? selectedBook.id : null,
        bookName: selectedBook ? selectedBook.name : null,
        cfi: editingNote ? editingNote.cfi : null,
        chapter: editingNote ? editingNote.chapter : null,
        note: noteText.trim(),
        createdAt: editingNote ? editingNote.createdAt : new Date().toISOString()
      };

      const updatedList = await saveBookmark(newNote);
      updatedList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setBookmarks(updatedList);
      setNoteModalVisible(false);
    } catch(e) {
      console.log('Error saving note', e);
      Alert.alert('Error', 'Could not save note.');
    }
  };

  const handleDeleteNote = (id) => {
    Alert.alert(
      'Delete Note',
      'Are you sure you want to delete this note?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
             const updated = await removeBookmark(id);
             updated.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
             setBookmarks(updated);
          }
        }
      ]
    );
  };

  const handleNotePress = (item) => {
    if (item.bookId) {
      // Find book details in library
      const matched = libraryBooks.find(b => b.id === item.bookId);
      if (matched) {
         navigation.navigate('Reader', { book: matched });
      } else {
         Alert.alert('Book Not Found', 'This note is linked to a book that is no longer in your library.');
      }
    }
  };

  const formatDate = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  const renderBookmarkItem = ({ item }) => {
    return (
      <View style={[styles.card, { 
        backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF',
        borderColor: isDarkMode ? '#2A2A2A' : '#E5E5E5'
      }]}>
        <TouchableOpacity 
          style={{ flex: 1 }} 
          onPress={() => handleNotePress(item)}
          activeOpacity={0.7}
        >
          {item.bookName && (
            <View style={styles.cardHeader}>
              <Ionicons name="book-outline" size={14} color={COLORS.primary} style={{ marginRight: 6 }} />
              <Text style={styles.cardBookTitle} numberOfLines={1}>{item.bookName}</Text>
              {item.chapter && (
                <Text style={styles.cardChapter} numberOfLines={1}> • {item.chapter}</Text>
              )}
            </View>
          )}

          <Text style={[styles.cardContent, { color: isDarkMode ? '#FFF' : '#333' }]}>
             {item.note}
          </Text>

          <View style={styles.cardFooter}>
             <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.cardActions}>
          <TouchableOpacity onPress={() => handleOpenEditNote(item)} style={styles.actionIconBtn}>
             <Ionicons name="create-outline" size={20} color="#3a7bd5" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDeleteNote(item.id)} style={styles.actionIconBtn}>
             <Ionicons name="trash-outline" size={20} color="#e74c3c" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? '#121212' : '#F5F5F5' }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.header, { 
        backgroundColor: isDarkMode ? '#121212' : '#F5F5F5',
        borderBottomColor: isDarkMode ? '#2A2A2A' : '#E0E0E0' 
      }]}>
        <TouchableOpacity style={{ padding: 5 }} onPress={() => setDrawerVisible(true)}>
          <Ionicons name="menu" size={28} color={isDarkMode ? '#FFF' : '#333'} />
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: 15 }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: isDarkMode ? '#FFF' : '#333' }}>
            Bookmarks & Notes
          </Text>
        </View>

        <TouchableOpacity style={{ padding: 5 }} onPress={handleOpenAddNote}>
          <Ionicons name="add" size={28} color={isDarkMode ? '#FFF' : '#333'} />
        </TouchableOpacity>
      </View>

      {/* Main List */}
      {bookmarks.length === 0 ? (
        <View style={styles.content}>
          <Ionicons name="bookmarks-outline" size={80} color={isDarkMode ? '#333' : '#CCC'} />
          <Text style={[styles.title, { color: isDarkMode ? '#FFF' : '#333' }]}>No Bookmarks Yet</Text>
          <Text style={[styles.subtitle, { color: isDarkMode ? '#888' : '#666' }]}>
            Write a general note using the '+' button above or highlights/bookmarks inside books to access them here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={bookmarks}
          keyExtractor={(item) => item.id}
          renderItem={renderBookmarkItem}
          contentContainerStyle={styles.list}
        />
      )}

      {/* FAB */}
      <TouchableOpacity 
        style={[styles.fab, { backgroundColor: COLORS.primary }]}
        onPress={handleOpenAddNote}
      >
        <Ionicons name="add" size={30} color="#FFF" />
      </TouchableOpacity>

      {/* Note Add/Edit Modal */}
      <Modal visible={noteModalVisible} transparent={true} animationType="fade" onRequestClose={() => setNoteModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setNoteModalVisible(false)}>
          <View style={[styles.modalContent, { backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF' }]}>
            <Text style={[styles.modalTitle, { color: isDarkMode ? '#FFF' : '#333' }]}>
              {editingNote ? 'Edit Note' : 'Add New Note'}
            </Text>

            {/* Book Link Dropdown Selector */}
            <View style={{ marginBottom: 15 }}>
               <TouchableOpacity 
                  style={[styles.dropdownBtn, { 
                     backgroundColor: isDarkMode ? '#2A2A2A' : '#EAEAEA',
                     borderColor: isDarkMode ? '#333' : '#CCC' 
                  }]}
                  onPress={() => setShowBookDropdown(!showBookDropdown)}
               >
                  <Ionicons name="link-outline" size={16} color={COLORS.primary} style={{ marginRight: 8 }} />
                  <Text style={{ color: isDarkMode ? '#FFF' : '#333', flex: 1, fontSize: 13 }} numberOfLines={1}>
                     {selectedBook ? `Link: ${selectedBook.name}` : 'Unlinked General Note'}
                  </Text>
                  <Ionicons name={showBookDropdown ? "chevron-up" : "chevron-down"} size={16} color="#888" />
               </TouchableOpacity>

               {showBookDropdown && (
                  <View style={[styles.dropdownList, { backgroundColor: isDarkMode ? '#252525' : '#F0F0F0' }]}>
                     <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled={true}>
                        <TouchableOpacity 
                           style={styles.dropdownOption}
                           onPress={() => { setSelectedBook(null); setShowBookDropdown(false); }}
                        >
                           <Text style={{ color: isDarkMode ? '#FFF' : '#333', fontSize: 12 }}>None (Unlinked General Note)</Text>
                        </TouchableOpacity>
                        {libraryBooks.map(b => (
                           <TouchableOpacity 
                              key={b.id}
                              style={styles.dropdownOption}
                              onPress={() => { setSelectedBook({ id: b.id, name: b.customTitle || b.name }); setShowBookDropdown(false); }}
                           >
                              <Text style={{ color: isDarkMode ? '#FFF' : '#333', fontSize: 12 }} numberOfLines={1}>
                                 {b.customTitle || b.name}
                              </Text>
                           </TouchableOpacity>
                        ))}
                     </ScrollView>
                  </View>
               )}
            </View>

            {/* Note text field */}
            <TextInput 
              style={[styles.input, { 
                 backgroundColor: isDarkMode ? '#2A2A2A' : '#EAEAEA',
                 color: isDarkMode ? '#FFF' : '#333',
                 borderColor: isDarkMode ? '#333' : '#CCC'
              }]}
              placeholder="Write your note here..."
              placeholderTextColor="#888"
              value={noteText}
              onChangeText={setNoteText}
              multiline={true}
              numberOfLines={6}
              textAlignVertical="top"
              autoFocus
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={() => setNoteModalVisible(false)} style={styles.cancelBtn}>
                <Text style={{ color: '#AAA', fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveNote} style={styles.saveBtn}>
                <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Settings Navigation Drawer */}
      <SettingsDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        navigation={navigation}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 60,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  list: {
    padding: 15,
    paddingBottom: 100,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardBookTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3a7bd5',
    maxWidth: '55%',
  },
  cardChapter: {
    fontSize: 11,
    color: '#888',
    maxWidth: '40%',
  },
  cardContent: {
    fontSize: 15,
    lineHeight: 22,
  },
  cardFooter: {
    marginTop: 10,
  },
  cardDate: {
    fontSize: 10,
    color: '#888',
  },
  cardActions: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingLeft: 10,
  },
  actionIconBtn: {
    padding: 8,
    marginBottom: 5,
  },
  fab: {
     position: 'absolute',
     bottom: 30,
     right: 30,
     width: 56,
     height: 56,
     borderRadius: 28,
     alignItems: 'center',
     justifyContent: 'center',
     elevation: 5,
     shadowColor: '#000',
     shadowOffset: { width: 0, height: 4 },
     shadowOpacity: 0.3,
     shadowRadius: 4,
     zIndex: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    borderRadius: 16,
    padding: 24,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  dropdownBtn: {
     flexDirection: 'row',
     alignItems: 'center',
     padding: 12,
     borderRadius: 8,
     borderWidth: 1,
  },
  dropdownList: {
     marginTop: 4,
     borderRadius: 8,
     padding: 5,
     borderWidth: 1,
     borderColor: 'rgba(128,128,128,0.1)',
  },
  dropdownOption: {
     padding: 10,
     borderBottomWidth: 1,
     borderBottomColor: 'rgba(128,128,128,0.05)',
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    fontSize: 15,
    height: 120,
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
  saveBtn: {
    padding: 10,
    backgroundColor: '#3a7bd5',
    borderRadius: 8,
    paddingHorizontal: 20,
  },
});
