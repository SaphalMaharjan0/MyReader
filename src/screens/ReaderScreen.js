import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, Text, ScrollView, Alert, Modal, Image, FlatList, Dimensions, Animated } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants/theme';
import * as FileSystem from 'expo-file-system/legacy';
import { getToolbarConfig } from '../utils/toolbarStore';
import { updateBook, getSettings } from '../utils/storage';
import * as Speech from 'expo-speech';
import { TextInput } from 'react-native';

const HTML_CONTENT = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.1.5/jszip.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/epubjs/dist/epub.min.js"></script>
    <style>
      body { 
        margin: 0; 
        padding: 0; 
        background: ${COLORS.sepia}; 
        color: ${COLORS.text};
        overflow: hidden !important;
      }
      #viewer { 
        width: 100vw; 
        height: 100vh; 
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch !important;
      }
    </style>
  </head>
  <body>
    <div id="viewer"></div>
    <script>
      var book;
      var rendition;

      function sendToReact(data) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }

      document.addEventListener("message", function(event) {
        var data = JSON.parse(event.data);
        
        if(data.type === 'load') {
           // For base64 loading
           var binaryStr = atob(data.base64);
           var len = binaryStr.length;
           var bytes = new Uint8Array(len);
           for (var i = 0; i < len; i++) {
               bytes[i] = binaryStr.charCodeAt(i);
           }
           
           book = ePub(bytes.buffer);
           rendition = book.renderTo("viewer", {
              width: "100%",
              height: "100%",
              spread: "none",
              manager: "continuous",
              flow: "scrolled-doc"
           });
           window.currentThemeMode = 'light';
           rendition.hooks.content.register(function(content) {
               var doc = content.document;
               var style = doc.createElement('style');
               style.id = 'dynamic-theme';
               if (window.currentThemeMode === 'dark') {
                   style.innerHTML = "* { color: #FFFFFF !important; background-color: transparent !important; } body { background-color: #121212 !important; }";
               } else {
                   style.innerHTML = "* { color: #333333 !important; background-color: transparent !important; } body { background-color: #F4ECD8 !important; }";
               }
               doc.head.appendChild(style);
           });
           
           var initialLocation = data.lastLocation || undefined;
           rendition.display(initialLocation).then(function() {
              sendToReact({ type: 'ready' });
           }).catch(function(err) {
              sendToReact({ type: 'error', message: err.toString() });
           });

           book.loaded.navigation.then(function(nav) {
              var chaptersData = [];
              var extractToc = function(items) {
                 (items || []).forEach(function(item) {
                    chaptersData.push({ id: item.id, label: item.label, href: item.href });
                    if (item.subitems && item.subitems.length > 0) {
                       extractToc(item.subitems);
                    }
                 });
              };
              extractToc(nav.toc);
              sendToReact({ type: 'toc', chapters: chaptersData });
           });

           book.ready.then(function() {
              var manifest = book.packaging.manifest;
              var imageAssets = [];
              for(var key in manifest) {
                 if(manifest[key].type && manifest[key].type.indexOf('image/') === 0) {
                    imageAssets.push(manifest[key]);
                 }
              }
              var promises = imageAssets.map(function(item) {
                 var url = book.path ? book.path.resolve(item.href) : item.href;
                 return book.archive.getBlob(url).then(function(blob) {
                    return new Promise(function(resolve, reject) {
                       var reader = new FileReader();
                       reader.onloadend = function() { resolve(reader.result); };
                       reader.onerror = reject;
                       reader.readAsDataURL(blob);
                    });
                 }).catch(function(err) { 
                    sendToReact({ type: 'error', message: 'Image Extract Error: ' + url + ' - ' + err.toString() });
                    return null; 
                 });
              });
              Promise.all(promises).then(function(dataUris) {
                 var validUrls = dataUris.filter(function(uri) { return uri !== null; });
                 sendToReact({ type: 'images', urls: validUrls });
              });
           });
           
           var touchStartX = 0;
           var touchStartY = 0;

           // Mouse clicks (for emulator/web)
           rendition.on("click", function(e) {
              var width = window.innerWidth;
              if (e.clientX > width * 0.25 && e.clientX < width * 0.75) {
                 sendToReact({ type: 'toggleMenu' });
              }
           });
           
           // Touch events (for physical mobile devices)
           rendition.on("touchstart", function(e) {
              var touch = e.changedTouches ? e.changedTouches[0] : e.touches[0];
              if (touch) {
                 touchStartX = touch.clientX;
                 touchStartY = touch.clientY;
              }
           });

           rendition.on("touchend", function(e) {
              var touch = e.changedTouches ? e.changedTouches[0] : e.touches[0];
              if (touch) {
                 var touchEndX = touch.clientX;
                 var touchEndY = touch.clientY;
                 
                 var distanceX = touchEndX - touchStartX;
                 var distanceY = touchEndY - touchStartY;
                 
                 // Only trigger tap if they didn't scroll much (allow native scrolling)
                 if (Math.abs(distanceX) < 15 && Math.abs(distanceY) < 15) {
                    var width = window.innerWidth;
                    if (touchEndX > width * 0.25 && touchEndX < width * 0.75) {
                       sendToReact({ type: 'toggleMenu' });
                    }
                 }
              }
           });

           rendition.on('relocated', function(location) {
               if (location && location.start) {
                   var percentage = (location.start.index + 1) / book.spine.length;
                   sendToReact({ type: 'relocated', cfi: location.start.cfi, percentage: percentage });
               }
           });
        } else if (data.type === 'theme') {
           window.currentThemeMode = data.mode;
           if (rendition) {
               var contents = rendition.getContents();
               contents.forEach(function(content) {
                   var doc = content.document;
                   var style = doc.getElementById('dynamic-theme');
                   if (!style) {
                       style = doc.createElement('style');
                       style.id = 'dynamic-theme';
                       doc.head.appendChild(style);
                   }
                   if (data.mode === 'dark') {
                       style.innerHTML = "* { color: #FFFFFF !important; background-color: transparent !important; } body { background-color: #121212 !important; }";
                   } else {
                       style.innerHTML = "* { color: #333333 !important; background-color: transparent !important; } body { background-color: #F4ECD8 !important; }";
                   }
               });
           }
        } else if (data.type === 'fontsize') {
           if(rendition) {
              rendition.themes.fontSize(data.size + "%");
           }
        } else if (data.type === 'goto') {
           if(rendition) {
              var target = data.href;
              rendition.display(target).catch(function(err){
                 var spineItems = book.spine.items;
                 var found = false;
                 for(var i = 0; i < spineItems.length; i++) {
                     if (spineItems[i].href && spineItems[i].href.indexOf(target) !== -1) {
                         rendition.display(spineItems[i].href);
                         found = true;
                         break;
                     }
                 }
                 if(!found) {
                     var baseHref = target.split('#')[0];
                     for(var i = 0; i < spineItems.length; i++) {
                         if (spineItems[i].href && spineItems[i].href.indexOf(baseHref) !== -1) {
                             rendition.display(spineItems[i].href);
                             found = true;
                             break;
                         }
                     }
                     if (!found) {
                         sendToReact({ type: 'error', message: "Jump Error: Section not found." });
                     }
                 }
              });
           }
         } else if (data.type === 'autoscroll') {
           if (window.autoScrollFrame) { cancelAnimationFrame(window.autoScrollFrame); window.autoScrollFrame = null; }
           if (data.action === 'start') {
              var speed = data.speed || 1;
              function step() {
                  var viewer = document.getElementById('viewer');
                  if (viewer) viewer.scrollBy(0, speed);
                  window.autoScrollFrame = requestAnimationFrame(step);
              }
              window.autoScrollFrame = requestAnimationFrame(step);
           }
        } else if (data.type === 'tts_extract') {
           if (rendition) {
               var contents = rendition.getContents();
               if (contents.length > 0) {
                   var text = contents[0].document.body.innerText || contents[0].document.body.textContent;
                   var sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [text];
                   sendToReact({ type: 'tts_data', paragraphs: sentences.map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; }) });
               }
           }
        } else if (data.type === 'search') {
           if (book) {
               var query = data.query.toLowerCase();
               var results = [];
               var spineItems = book.spine.spineItems;
               var i = 0;
               function searchNext() {
                   if (i >= spineItems.length) {
                       sendToReact({ type: 'search_results', results: results });
                       return;
                   }
                   var item = spineItems[i];
                   item.load(book.load.bind(book)).then(function(doc) {
                       var text = "";
                       if (typeof doc === 'string') {
                           text = doc.replace(/<[^>]+>/g, ' ').toLowerCase();
                       } else {
                           text = (doc.body || doc).textContent.toLowerCase();
                         }
                         var idx = text.indexOf(query);
                         while (idx !== -1) {
                             var snippet = text.substring(Math.max(0, idx - 40), Math.min(text.length, idx + 40));
                             results.push({ cfi: item.href, snippet: "..." + snippet + "..." });
                             idx = text.indexOf(query, idx + 1);
                         }
                         i++;
                         setTimeout(searchNext, 10);
                     }).catch(function() {
                         i++;
                         setTimeout(searchNext, 10);
                     });
                 }
                 searchNext();
              }
           }
         });
         
         // Also support iOS postMessage
         window.addEventListener("message", function(event) {
           document.dispatchEvent(new MessageEvent("message", { data: event.data }));
         });
       </script>
     </body>
     </html>
   `;

const WEBVIEW_SOURCE = { html: HTML_CONTENT };

export default function ReaderScreen({ route, navigation }) {
  const { book } = route.params;
  const webviewRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [toolbarConfig, setToolbarConfig] = useState([]);
  const [menuVisible, setMenuVisible] = useState(false);
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);
  
  // Phase 1 Features
  const [themeMode, setThemeMode] = useState('dark');
  const [fontSize, setFontSize] = useState(100);
  const [chapters, setChapters] = useState([]);
  const [chaptersVisible, setChaptersVisible] = useState(false);
  const [images, setImages] = useState([]);
  const [imagesVisible, setImagesVisible] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(null);
  const { width: windowWidth, height: windowHeight } = Dimensions.get('window');

  // Phase 2 Features
  const [autoScrollVisible, setAutoScrollVisible] = useState(false);
  const [autoScrollPlaying, setAutoScrollPlaying] = useState(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(1);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [ttsVisible, setTtsVisible] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsParagraphs, setTtsParagraphs] = useState([]);
  const [currentTtsIndex, setCurrentTtsIndex] = useState(0);
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [ttsPitch, setTtsPitch] = useState(1.0);

  const quickActions = toolbarConfig.slice(0, 4);
  const moreActions = toolbarConfig.slice(4);

  const insets = useSafeAreaInsets();
  const menuAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(menuAnim, {
      toValue: menuVisible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [menuVisible]);

  const animatedHeaderStyle = {
    opacity: menuAnim,
    transform: [
      {
        translateY: menuAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-100, 0],
        }),
      },
    ],
  };

  const animatedBottomToolbarStyle = {
    opacity: menuAnim,
    transform: [
      {
        translateY: menuAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [150, 0],
        }),
      },
    ],
  };

  useEffect(() => {
    const initReader = async () => {
      const settings = await getSettings();
      if (settings) {
        if (settings.readingTheme) setThemeMode(settings.readingTheme);
        if (settings.defaultFontSize) setFontSize(settings.defaultFontSize);
      }
      loadBookData();
      loadToolbar();
    };
    initReader();
  }, []);

  const loadToolbar = async () => {
    const config = await getToolbarConfig();
    if (!config.find(c => c.id === 'images')) config.push({ id: 'images', name: 'Image Gallery', icon: 'images-outline', enabled: true });
    if (!config.find(c => c.id === 'autoscroll')) config.push({ id: 'autoscroll', name: 'Auto Scroll', icon: 'swap-vertical-outline', enabled: true });
    if (!config.find(c => c.id === 'tts')) config.push({ id: 'tts', name: 'Text-to-Speech', icon: 'volume-high-outline', enabled: true });
    if (!config.find(c => c.id === 'search')) config.push({ id: 'search', name: 'Search Book', icon: 'search-outline', enabled: true });
    setToolbarConfig(config.filter(item => item.enabled));
  };

  const loadBookData = async () => {
    try {
      const base64Data = await FileSystem.readAsStringAsync(book.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      setTimeout(() => {
        if (webviewRef.current) {
          webviewRef.current.postMessage(JSON.stringify({
            type: 'load',
            base64: base64Data,
            lastLocation: book.lastLocation
          }));
        }
      }, 1000);
    } catch (err) {
      console.error("Error reading book file:", err);
      setLoading(false);
    }
  };

  const onMessage = (event) => {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.type === 'ready') {
      setLoading(false);
    } else if (data.type === 'error') {
      console.error("EPUBJS Error:", data.message);
      setLoading(false);
    } else if (data.type === 'toggleMenu') {
      setMenuVisible(prev => !prev);
    } else if (data.type === 'toc') {
      setChapters(data.chapters);
    } else if (data.type === 'images') {
      setImages(data.urls);
    } else if (data.type === 'tts_data') {
      setTtsParagraphs(data.paragraphs);
      setCurrentTtsIndex(0);
      setTtsPlaying(true);
      playTts(data.paragraphs, 0);
    } else if (data.type === 'search_results') {
      setSearchResults(data.results);
      setIsSearching(false);
    } else if (data.type === 'relocated') {
      updateBook({ ...book, lastLocation: data.cfi, progress: data.percentage });
    }
  };

  const playTts = (paragraphs, index, rateOverride = ttsSpeed, pitchOverride = ttsPitch) => {
    if (index >= paragraphs.length) {
      setTtsPlaying(false);
      return;
    }
    Speech.speak(paragraphs[index], {
      rate: rateOverride,
      pitch: pitchOverride,
      onDone: () => {
        setCurrentTtsIndex(index + 1);
        playTts(paragraphs, index + 1, rateOverride, pitchOverride);
      },
      onError: () => setTtsPlaying(false)
    });
  };

  const stopTts = () => {
    Speech.stop();
    setTtsPlaying(false);
  };

  const handleTtsSettingChange = (type, action) => {
      let newVal;
      if (type === 'speed') {
          newVal = action === 'up' ? Math.min(2.0, ttsSpeed + 0.25) : Math.max(0.5, ttsSpeed - 0.25);
          setTtsSpeed(newVal);
      } else {
          newVal = action === 'up' ? Math.min(2.0, ttsPitch + 0.1) : Math.max(0.5, ttsPitch - 0.1);
          setTtsPitch(newVal);
      }
      
      if (ttsPlaying) {
          Speech.stop();
          setTimeout(() => {
              playTts(ttsParagraphs, currentTtsIndex, type === 'speed' ? newVal : ttsSpeed, type === 'pitch' ? newVal : ttsPitch);
          }, 100);
      }
  };

  useEffect(() => {
    if (webviewRef.current && !loading) {
      webviewRef.current.postMessage(JSON.stringify({ type: 'theme', mode: themeMode }));
    }
  }, [themeMode, loading]);

  useEffect(() => {
    if (webviewRef.current && !loading) {
      webviewRef.current.postMessage(JSON.stringify({ type: 'fontsize', size: fontSize }));
    }
  }, [fontSize, loading]);

  const handleButtonPress = (btn) => {
    setMoreMenuVisible(false);
    if (btn.id === 'customize') {
      navigation.navigate('CustomizeToolbar', { onSave: (newConfig) => {
         setToolbarConfig(newConfig.filter(i => i.enabled));
      }});
    } else if (btn.id === 'daynight') {
      setThemeMode(prev => prev === 'light' ? 'dark' : (prev === 'dark' ? 'sepia' : 'light'));
    } else if (btn.id === 'fontsize') {
      Alert.alert('Font Size', 'Adjust font size', [
        { text: 'A-', onPress: () => setFontSize(prev => Math.max(50, prev - 25)) },
        { text: 'A+', onPress: () => setFontSize(prev => Math.min(200, prev + 25)) },
        { text: 'Cancel', style: 'cancel' }
      ]);
    } else if (btn.id === 'chapters') {
      setChaptersVisible(true);
    } else if (btn.id === 'images') {
      setImagesVisible(true);
    } else if (btn.id === 'autoscroll') {
      setAutoScrollVisible(true);
    } else if (btn.id === 'tts') {
      setTtsVisible(true);
      if (webviewRef.current) webviewRef.current.postMessage(JSON.stringify({ type: 'tts_extract' }));
    } else if (btn.id === 'search') {
      setSearchVisible(true);
    } else {
      Alert.alert(btn.name, `${btn.name} feature is coming soon!`);
      console.log(btn.name + ' pressed');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: themeMode === 'dark' ? '#121212' : (themeMode === 'sepia' ? COLORS.sepia : '#FFF') }]}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={[styles.readerContainer, themeMode === 'dark' && { backgroundColor: '#121212' }]}>
          <WebView
            ref={webviewRef}
            source={WEBVIEW_SOURCE}
            originWhitelist={['*']}
            onMessage={onMessage}
            style={styles.webview}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowFileAccess={true}
            allowFileAccessFromFileURLs={true}
            allowUniversalAccessFromFileURLs={true}
            nestedScrollEnabled={true}
          />
          
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Opening book...</Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      <Animated.View 
        style={[
          styles.header, 
          { paddingTop: Math.max(20, insets.top) },
          animatedHeaderStyle
        ]}
        pointerEvents={menuVisible ? 'auto' : 'none'}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.card} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {book.customTitle || book.name.replace(/\.epub$/i, '').replace(/\.pdf$/i, '')}
        </Text>
      </Animated.View>

      <Animated.View 
        style={[
          styles.bottomToolbar, 
          { 
            height: 80 + insets.bottom,
            paddingBottom: insets.bottom 
          },
          animatedBottomToolbarStyle
        ]}
        pointerEvents={menuVisible ? 'auto' : 'none'}
      >
        <View style={styles.toolbarRow}>
          {quickActions.map((btn) => (
            <TouchableOpacity 
              key={btn.id} 
              style={styles.toolbarButton}
              onPress={() => handleButtonPress(btn)}
            >
              <Ionicons name={btn.icon} size={24} color={COLORS.card} />
              <Text style={styles.toolbarButtonText} numberOfLines={1}>{btn.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity 
            style={styles.toolbarButton}
            onPress={() => setMoreMenuVisible(true)}
          >
            <Ionicons name="ellipsis-horizontal" size={24} color={COLORS.card} />
            <Text style={styles.toolbarButtonText} numberOfLines={1}>More</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Modal
        visible={moreMenuVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setMoreMenuVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMoreMenuVisible(false)}>
          <View style={styles.moreMenuContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.moreMenuHeader}>
              <Text style={styles.moreMenuTitle}>More Options</Text>
              <TouchableOpacity onPress={() => setMoreMenuVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.moreMenuGrid}>
              {moreActions.map((btn) => (
                <TouchableOpacity 
                  key={btn.id} 
                  style={styles.moreMenuButton}
                  onPress={() => handleButtonPress(btn)}
                >
                  <Ionicons name={btn.icon} size={28} color={COLORS.text} />
                  <Text style={styles.moreMenuButtonText} numberOfLines={2}>{btn.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
      <Modal visible={chaptersVisible} animationType="slide" onRequestClose={() => setChaptersVisible(false)}>
        <SafeAreaView style={[styles.container, themeMode === 'dark' && { backgroundColor: '#121212' }]}>
          <View style={[styles.header, themeMode === 'dark' && { backgroundColor: '#1F1F1F' }]}>
            <TouchableOpacity style={styles.backButton} onPress={() => setChaptersVisible(false)}>
              <Ionicons name="close" size={24} color={COLORS.card} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Table of Contents</Text>
          </View>
          <ScrollView>
            {chapters.map((chap, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.chapterItem, themeMode === 'dark' && { borderBottomColor: '#333' }]}
                onPress={() => {
                  setChaptersVisible(false);
                  if (webviewRef.current) {
                    webviewRef.current.postMessage(JSON.stringify({ type: 'goto', href: chap.href }));
                  }
                }}
              >
                <Text style={[styles.chapterText, themeMode === 'dark' && { color: '#FFF' }]}>{chap.label ? chap.label.trim() : 'Chapter ' + (idx + 1)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal visible={imagesVisible} animationType="slide" onRequestClose={() => setImagesVisible(false)}>
        <SafeAreaView style={[styles.container, themeMode === 'dark' && { backgroundColor: '#121212' }]}>
          <View style={[styles.header, themeMode === 'dark' && { backgroundColor: '#1F1F1F' }]}>
            <TouchableOpacity style={styles.backButton} onPress={() => setImagesVisible(false)}>
              <Ionicons name="close" size={24} color={COLORS.card} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Image Gallery</Text>
          </View>
          {images.length === 0 ? (
            <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
              <Text style={{color: COLORS.text}}>No images found in this book.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.imageGrid}>
              {images.map((imgUrl, idx) => (
                <TouchableOpacity key={idx} style={styles.imageWrapper} onPress={() => setSelectedImageIndex(idx)}>
                  <Image source={{ uri: imgUrl }} style={styles.galleryImage} resizeMode="contain" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
      <Modal visible={selectedImageIndex !== null} transparent={true} animationType="fade" onRequestClose={() => setSelectedImageIndex(null)}>
        <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.95)'}}>
          <SafeAreaView style={{flex: 1}}>
              <TouchableOpacity style={{position: 'absolute', top: 20, right: 20, zIndex: 10}} onPress={() => setSelectedImageIndex(null)}>
                <Ionicons name="close-circle" size={36} color="#FFFFFF" />
              </TouchableOpacity>
              <FlatList
                data={images}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={selectedImageIndex !== null ? selectedImageIndex : 0}
                getItemLayout={(data, index) => ({ length: windowWidth, offset: windowWidth * index, index })}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => (
                  <View style={{width: windowWidth, height: '100%', justifyContent: 'center', alignItems: 'center'}}>
                    <Image source={{ uri: item }} style={{width: '100%', height: '90%'}} resizeMode="contain" />
                  </View>
                )}
              />
          </SafeAreaView>
        </View>
      </Modal>

      {/* Auto Scroll Overlay */}
      {autoScrollVisible && (
        <View style={{position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: COLORS.card, padding: 10, borderRadius: 20, flexDirection: 'row', alignItems: 'center', zIndex: 100}}>
          <TouchableOpacity onPress={() => { setAutoScrollVisible(false); setAutoScrollPlaying(false); webviewRef.current.postMessage(JSON.stringify({ type: 'autoscroll', action: 'stop' })); }}>
            <Ionicons name="close-circle" size={32} color={COLORS.text} style={{marginRight: 10}} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {
            const newPlaying = !autoScrollPlaying;
            setAutoScrollPlaying(newPlaying);
            webviewRef.current.postMessage(JSON.stringify({ type: 'autoscroll', action: newPlaying ? 'start' : 'stop', speed: autoScrollSpeed }));
          }}>
            <Ionicons name={autoScrollPlaying ? "pause-circle" : "play-circle"} size={48} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {
            const newSpeed = autoScrollSpeed === 1 ? 1.5 : (autoScrollSpeed === 1.5 ? 2 : 1);
            setAutoScrollSpeed(newSpeed);
            if (autoScrollPlaying) webviewRef.current.postMessage(JSON.stringify({ type: 'autoscroll', action: 'start', speed: newSpeed }));
          }} style={{marginLeft: 10, padding: 10, backgroundColor: COLORS.background, borderRadius: 10}}>
            <Text style={{color: COLORS.text, fontWeight: 'bold'}}>{autoScrollSpeed}x</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* TTS Overlay */}
      {ttsVisible && (
        <View style={{position: 'absolute', bottom: 80, alignSelf: 'center', backgroundColor: COLORS.card, padding: 15, borderRadius: 20, width: '90%', zIndex: 100, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84}}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15}}>
              <Text style={{color: COLORS.text, fontWeight: 'bold', fontSize: 18}}>Text to Speech</Text>
              <TouchableOpacity onPress={() => { setTtsVisible(false); stopTts(); }}>
                <Ionicons name="close-circle" size={32} color={COLORS.text} />
              </TouchableOpacity>
          </View>

          <View style={{flexDirection: 'row', justifyContent: 'center', marginBottom: 15}}>
              <TouchableOpacity onPress={() => {
                if (ttsPlaying) { 
                    Speech.stop(); 
                    setTtsPlaying(false); 
                } else { 
                    setTtsPlaying(true); 
                    playTts(ttsParagraphs, currentTtsIndex); 
                }
              }}>
                <Ionicons name={ttsPlaying ? "pause-circle" : "play-circle"} size={64} color={COLORS.primary} />
              </TouchableOpacity>
          </View>

          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
              <Text style={{color: COLORS.text, width: 60}}>Speed</Text>
              <TouchableOpacity onPress={() => handleTtsSettingChange('speed', 'down')}>
                  <Ionicons name="remove-circle-outline" size={32} color={COLORS.primary} />
              </TouchableOpacity>
              <Text style={{color: COLORS.text, width: 50, textAlign: 'center'}}>{ttsSpeed.toFixed(2)}x</Text>
              <TouchableOpacity onPress={() => handleTtsSettingChange('speed', 'up')}>
                  <Ionicons name="add-circle-outline" size={32} color={COLORS.primary} />
              </TouchableOpacity>
          </View>

          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
              <Text style={{color: COLORS.text, width: 60}}>Pitch</Text>
              <TouchableOpacity onPress={() => handleTtsSettingChange('pitch', 'down')}>
                  <Ionicons name="remove-circle-outline" size={32} color={COLORS.primary} />
              </TouchableOpacity>
              <Text style={{color: COLORS.text, width: 50, textAlign: 'center'}}>{ttsPitch.toFixed(1)}</Text>
              <TouchableOpacity onPress={() => handleTtsSettingChange('pitch', 'up')}>
                  <Ionicons name="add-circle-outline" size={32} color={COLORS.primary} />
              </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Search Modal */}
      <Modal visible={searchVisible} animationType="slide" onRequestClose={() => setSearchVisible(false)}>
        <SafeAreaView style={[styles.container, themeMode === 'dark' && { backgroundColor: '#121212' }]}>
          <View style={[styles.header, themeMode === 'dark' && { backgroundColor: '#1F1F1F' }]}>
            <TouchableOpacity style={styles.backButton} onPress={() => setSearchVisible(false)}>
              <Ionicons name="close" size={24} color={COLORS.card} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Search Book</Text>
          </View>
          <View style={{padding: 10, flexDirection: 'row'}}>
            <TextInput 
              style={{flex: 1, backgroundColor: COLORS.card, color: COLORS.text, padding: 10, borderRadius: 10}} 
              placeholder="Search entire book..." 
              placeholderTextColor="#888"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={() => {
                 if(searchQuery.trim().length > 2) {
                    setIsSearching(true);
                    setSearchResults([]);
                    webviewRef.current.postMessage(JSON.stringify({ type: 'search', query: searchQuery }));
                 }
              }}
            />
          </View>
          {isSearching ? (
             <View style={{flex: 1, justifyContent: 'center'}}><ActivityIndicator size="large" color={COLORS.primary}/></View>
          ) : (
             <FlatList
                data={searchResults}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({item}) => (
                   <TouchableOpacity style={{padding: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border}} onPress={() => {
                       setSearchVisible(false);
                       webviewRef.current.postMessage(JSON.stringify({ type: 'goto', href: item.cfi }));
                   }}>
                       <Text style={{color: COLORS.text}}>{item.snippet}</Text>
                   </TouchableOpacity>
                )}
             />
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SIZES.medium,
    backgroundColor: COLORS.primary,
  },
  backButton: {
    marginRight: SIZES.medium,
  },
  headerTitle: {
    flex: 1,
    fontSize: SIZES.large,
    fontWeight: 'bold',
    color: COLORS.card,
  },
  readerContainer: {
    flex: 1,
    backgroundColor: COLORS.sepia,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.sepia,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SIZES.medium,
    fontSize: SIZES.medium,
    color: COLORS.text,
  },
  bottomToolbar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    height: 80,
    backgroundColor: COLORS.primary,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  toolbarScroll: {
    paddingHorizontal: SIZES.small,
    alignItems: 'center',
  },
  toolbarButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 70,
    marginHorizontal: 4,
  },
  toolbarButtonText: {
    color: COLORS.card,
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  toolbarRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    width: '100%',
    height: 80,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  moreMenuContainer: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: SIZES.large,
    borderTopRightRadius: SIZES.large,
    padding: SIZES.medium,
    maxHeight: '70%',
  },
  moreMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.medium,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SIZES.small,
  },
  moreMenuTitle: {
    fontSize: SIZES.large,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  moreMenuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: SIZES.extraLarge,
  },
  moreMenuButton: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: COLORS.card,
    borderRadius: SIZES.medium,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SIZES.medium,
    padding: SIZES.small,
  },
  moreMenuButtonText: {
    color: COLORS.text,
    fontSize: 12,
    marginTop: SIZES.small,
    textAlign: 'center',
  },
  chapterItem: {
    padding: SIZES.large,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  chapterText: {
    fontSize: SIZES.medium,
    color: COLORS.text,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: SIZES.small,
  },
  imageWrapper: {
    width: '48%',
    aspectRatio: 1,
    margin: '1%',
    backgroundColor: COLORS.card,
    borderRadius: SIZES.small,
    overflow: 'hidden',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  }
});
