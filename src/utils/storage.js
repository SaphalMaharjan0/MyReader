import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const BOOKS_KEY = '@my_books_list';

export const getBooks = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(BOOKS_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error reading books from storage', e);
    return [];
  }
};

export const saveBook = async (book) => {
  try {
    const currentBooks = await getBooks();
    // Prevent duplicates by checking URI
    const existingIndex = currentBooks.findIndex((b) => b.uri === book.uri);
    if (existingIndex >= 0) {
      return currentBooks; // Already exists
    }
    
    const newBooks = [...currentBooks, book];
    const jsonValue = JSON.stringify(newBooks);
    await AsyncStorage.setItem(BOOKS_KEY, jsonValue);
    return newBooks;
  } catch (e) {
    console.error('Error saving book to storage', e);
    return [];
  }
};

export const removeBook = async (bookUri) => {
  try {
    const currentBooks = await getBooks();
    const newBooks = currentBooks.filter((b) => b.uri !== bookUri);
    const jsonValue = JSON.stringify(newBooks);
    await AsyncStorage.setItem(BOOKS_KEY, jsonValue);
    return newBooks;
  } catch (e) {
    console.error('Error removing book from storage', e);
    return [];
  }
};

export const clearBooks = async () => {
  try {
    await AsyncStorage.removeItem(BOOKS_KEY);
    return true;
  } catch (e) {
    console.error('Error clearing books from storage', e);
    return false;
  }
};

export const updateBook = async (book) => {
  try {
    const currentBooks = await getBooks();
    const index = currentBooks.findIndex((b) => b.id === book.id);
    if (index >= 0) {
      currentBooks[index] = book;
      await AsyncStorage.setItem(BOOKS_KEY, JSON.stringify(currentBooks));
    }
    return currentBooks;
  } catch (e) {
    console.error('Error updating book', e);
    return [];
  }
};

const SETTINGS_KEY = '@app_settings';

export const getSettings = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(SETTINGS_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : {
      darkMode: true,
      autoSync: false,
      notifications: true,
      readingTheme: 'dark',
      defaultFontSize: 100,
      fontFamily: 'System',
    };
  } catch (e) {
    console.error('Error reading settings', e);
    return {
      darkMode: true,
      autoSync: false,
      notifications: true,
      readingTheme: 'dark',
      defaultFontSize: 100,
      fontFamily: 'System',
    };
  }
};

export const updateSettings = async (newSettings) => {
  try {
    const current = await getSettings();
    const updated = { ...current, ...newSettings };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Error updating settings', e);
    return null;
  }
};

export const importMoonReaderData = async (fileContent, fileName = '') => {
  try {
    const newBooks = [];
    
    if (fileName.endsWith('.mrpro') || fileName.endsWith('.zip')) {
      const fflate = require('fflate');
      const SQLite = require('expo-sqlite');
      
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const lookup = new Uint8Array(256);
      for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
      let bufferLength = fileContent.length * 0.75;
      if (fileContent[fileContent.length - 1] === '=') bufferLength--;
      if (fileContent[fileContent.length - 2] === '=') bufferLength--;

      const bytes = new Uint8Array(bufferLength);
      let p = 0;
      for (let i = 0; i < fileContent.length; i += 4) {
        const encoded1 = lookup[fileContent.charCodeAt(i)];
        const encoded2 = lookup[fileContent.charCodeAt(i+1)];
        const encoded3 = lookup[fileContent.charCodeAt(i+2)];
        const encoded4 = lookup[fileContent.charCodeAt(i+3)];

        bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
        if (encoded3 !== undefined) bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
        if (encoded4 !== undefined) bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
      }
      
      const unzipped = fflate.unzipSync(bytes);
      const fileNames = Object.keys(unzipped);
      let dbFileName = fileNames.find(k => k.endsWith('.db') || k.endsWith('.sqlite'));
      
      let namesListKey = fileNames.find(k => k.endsWith('_names.list'));
      if (namesListKey) {
         const bytes = unzipped[namesListKey];
         let str = '';
         for (let i = 0; i < bytes.length; i++) {
            str += String.fromCharCode(bytes[i]);
         }
         const lines = str.split(/\r?\n/);
         let historyTagIndex = -1;
         for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('history.txt')) {
               historyTagIndex = i + 1; // 1-indexed
               break;
            }
         }
         
         if (historyTagIndex !== -1) {
            let historyKey = fileNames.find(k => k.endsWith(`/${historyTagIndex}.tag`) || k === `${historyTagIndex}.tag`);
            if (historyKey) {
               const histBytes = unzipped[historyKey];
               let histStr = '';
               for (let i = 0; i < histBytes.length; i++) {
                  histStr += String.fromCharCode(histBytes[i]);
               }
               const lines = histStr.split(/\r?\n/);
               for (let j = 0; j < lines.length; j++) {
                  const line = lines[j].trim();
                  if (!line || line.endsWith('.md')) continue; // Skip empty lines and notes
                  
                  const parts = line.split('/');
                  if (parts.length > 0) {
                     const filenameWithExt = parts[parts.length - 1];
                     const extIndex = filenameWithExt.lastIndexOf('.');
                     const title = extIndex !== -1 ? filenameWithExt.substring(0, extIndex) : filenameWithExt;
                     
                     let author = 'Unknown';
                     // Usually the parent folder is the author or series name
                     if (parts.length > 1 && parts[parts.length - 2] !== 'MoonReader') {
                        author = parts[parts.length - 2];
                     }
                     
                     newBooks.push({
                       id: 'imported_mrpro_' + Date.now() + '_' + j,
                       name: title,
                       customTitle: title,
                       author: author,
                       uri: 'file://' + line,
                       type: line.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/epub+zip',
                       dateAdded: new Date().toISOString(),
                       coverUri: null,
                       progress: 0
                     });
                  }
               }
            }
         }
      }
      
      if (newBooks.length === 0) {
         throw new Error('This .mrpro file did not contain any valid books in its history.');
      }
    } else {
      // txt parser
      const lines = fileContent.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        let title = line;
        let author = '';
        if (line.includes(' - ')) {
           const parts = line.split(' - ');
           title = parts[0].trim();
           author = parts.slice(1).join(' - ').trim();
        }

        newBooks.push({
          id: 'imported_txt_' + Date.now() + '_' + i,
          name: title,
          customTitle: title,
          author: author,
          uri: 'imported://txt_' + Date.now() + i,
          type: 'text/plain',
          dateAdded: new Date().toISOString(),
          coverUri: null
        });
      }
    }

    if (newBooks.length > 0) {
       const currentBooks = await getBooks();
       const merged = [...currentBooks, ...newBooks];
       await AsyncStorage.setItem(BOOKS_KEY, JSON.stringify(merged));
       return merged;
    }
    return null;
  } catch (e) {
    console.error('Error parsing Moon Reader file', e);
    throw e;
  }
};

