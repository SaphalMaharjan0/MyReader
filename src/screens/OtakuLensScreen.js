import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Image, 
  ScrollView, 
  ActivityIndicator, 
  Alert, 
  Platform, 
  Linking, 
  Animated, 
  Easing 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../constants/theme';
import { getSettings, subscribeToSettings } from '../utils/storage';

export default function OtakuLensScreen() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.6);
  
  // Search results
  const [animeMatch, setAnimeMatch] = useState(null);
  const [animeDetails, setAnimeDetails] = useState(null);
  const [sourceMaterial, setSourceMaterial] = useState([]);
  const [candidatesList, setCandidatesList] = useState([]);
  const [traceMatches, setTraceMatches] = useState([]);

  // Scanning animation
  const scanAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

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

  // Set up animations when loading
  useEffect(() => {
    if (loading) {
      // Scanning line loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(scanAnim, {
            toValue: 0,
            duration: 2000,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        ])
      ).start();

      // Pulsing pulse loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 1000,
            easing: Easing.ease,
            useNativeDriver: true,
          })
        ])
      ).start();
    } else {
      scanAnim.setValue(0);
      pulseAnim.setValue(1);
    }
  }, [loading]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Permission to access your gallery is required to upload images.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedImage(result.assets[0].uri);
        clearResults();
      }
    } catch (e) {
      console.log('Error picking image:', e);
      Alert.alert('Error', 'Failed to pick image.');
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Permission to access your camera is required to snap photos.');
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedImage(result.assets[0].uri);
        clearResults();
      }
    } catch (e) {
      console.log('Error taking photo:', e);
      Alert.alert('Error', 'Failed to capture photo.');
    }
  };

  const clearResults = () => {
    setAnimeMatch(null);
    setAnimeDetails(null);
    setSourceMaterial([]);
    setCandidatesList([]);
    setTraceMatches([]);
    setError(null);
  };

  const resetAll = () => {
    setSelectedImage(null);
    clearResults();
  };

  const formatTimecode = (seconds) => {
    if (!seconds) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const formattedMins = mins < 10 ? `0${mins}` : mins;
    const formattedSecs = secs < 10 ? `0${secs}` : secs;

    if (hrs > 0) {
      return `${hrs}:${formattedMins}:${formattedSecs}`;
    }
    return `${formattedMins}:${formattedSecs}`;
  };

  const analyzeScene = async () => {
    if (!selectedImage) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Prepare form data for trace.moe
      const formData = new FormData();
      formData.append('image', {
        uri: selectedImage,
        name: 'scene.jpg',
        type: 'image/jpeg',
      });

      // 2. Fetch match from trace.moe API
      const searchRes = await fetch('https://api.trace.moe/search', {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!searchRes.ok) {
        if (searchRes.status === 429) {
          throw new Error('Too many requests. Please wait a minute and try again.');
        }
        throw new Error('Failed to search anime scene. Please try another image.');
      }

      const matchData = await searchRes.json();
      if (!matchData.result || matchData.result.length === 0) {
        throw new Error('No anime scene match found. Try a cleaner screenshot.');
      }

      // Filter matches by similarityThreshold
      const filteredMatches = matchData.result.filter(m => m.similarity >= similarityThreshold);
      if (filteredMatches.length === 0) {
        const bestSim = matchData.result[0].similarity;
        throw new Error(`Confidence rate too low. The matched scene similarity (${Math.round(bestSim * 1000) / 10}%) is below your selected threshold (${Math.round(similarityThreshold * 100)}%).`);
      }

      setTraceMatches(filteredMatches);

      // Fetch details for all filtered candidates (up to top 5)
      const ids = [...new Set(filteredMatches.slice(0, 5).map(m => m.anilist))];
      const candidates = await fetchAllCandidatesDetails(ids);
      setCandidatesList(candidates);

      // Find the first match candidate that has metadata resolved
      const firstCandidate = candidates.find(c => c.id === filteredMatches[0].anilist) || candidates[0];
      if (firstCandidate) {
        const matchingTraceResult = filteredMatches.find(m => m.anilist === firstCandidate.id);
        setAnimeMatch(matchingTraceResult || filteredMatches[0]);
        setAnimeDetails(firstCandidate);

        // Populate source relations
        if (firstCandidate.relations && firstCandidate.relations.edges) {
          const sources = firstCandidate.relations.edges
            .filter(edge => edge.node.type === 'MANGA')
            .map(edge => ({
              relation: edge.relationType,
              ...edge.node
            }));
          setSourceMaterial(sources);
        }
      } else {
        // Fallback
        const bestMatch = filteredMatches[0];
        setAnimeMatch(bestMatch);
        await fetchAnilistDetails(bestMatch.anilist);
      }

    } catch (err) {
      console.error(err);
      setError(err.message || 'An error occurred during scene identification.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAnilistDetails = async (anilistId) => {
    const query = `
      query ($id: Int) {
        Media (id: $id, type: ANIME) {
          id
          title {
            romaji
            english
            native
          }
          coverImage {
            large
            extraLarge
          }
          description
          episodes
          status
          genres
          relations {
            edges {
              relationType
              node {
                id
                title {
                  romaji
                  english
                  native
                }
                type
                format
                status
                volumes
                chapters
                description
                coverImage {
                  large
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { id: anilistId },
        }),
      });

      const json = await response.json();
      if (json.data && json.data.Media) {
        const media = json.data.Media;
        setAnimeDetails(media);

        // Filter relations for Manga type (novels, manga are typed as MANGA)
        if (media.relations && media.relations.edges) {
          const sources = media.relations.edges
            .filter(edge => edge.node.type === 'MANGA')
            .map(edge => ({
              relation: edge.relationType,
              ...edge.node
            }));
          setSourceMaterial(sources);
        }
      }
    } catch (e) {
      console.log('Error fetching Anilist details:', e);
    }
  };

  const fetchAllCandidatesDetails = async (ids) => {
    if (!ids || ids.length === 0) return [];
    
    const query = `
      query ($ids: [Int]) {
        Page (page: 1, perPage: 5) {
          media (id_in: $ids) {
            id
            title {
              romaji
              english
              native
            }
            coverImage {
              large
            }
            description
            episodes
            status
            genres
            relations {
              edges {
                relationType
                node {
                  id
                  title {
                    romaji
                    english
                    native
                  }
                  type
                  format
                  status
                  volumes
                  chapters
                  description
                  coverImage {
                    large
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { ids },
        }),
      });

      const json = await response.json();
      if (json.data && json.data.Page && json.data.Page.media) {
        return json.data.Page.media;
      }
    } catch (e) {
      console.log('Error batch fetching candidate details:', e);
    }
    return [];
  };

  const handleSelectCandidate = (candidateId) => {
    const candidate = candidatesList.find(c => c.id === candidateId);
    const traceMatch = traceMatches.find(m => m.anilist === candidateId);
    if (candidate && traceMatch) {
      setAnimeMatch(traceMatch);
      setAnimeDetails(candidate);

      // Populate source relations
      if (candidate.relations && candidate.relations.edges) {
        const sources = candidate.relations.edges
          .filter(edge => edge.node.type === 'MANGA')
          .map(edge => ({
            relation: edge.relationType,
            ...edge.node
          }));
        setSourceMaterial(sources);
      } else {
        setSourceMaterial([]);
      }
    }
  };

  const searchVolumeUpdates = (title, format, currentVol) => {
    const formatLabel = format === 'NOVEL' ? 'Light Novel' : 'Manga';
    const targetVol = currentVol ? `Volume ${currentVol + 1}` : 'new volume';
    const query = encodeURIComponent(`"${title}" ${formatLabel} ${targetVol} release date updates`);
    const searchUrl = `https://www.google.com/search?q=${query}`;
    Linking.openURL(searchUrl);
  };

  const openBookWalkerSearch = (title) => {
    const query = encodeURIComponent(title);
    Linking.openURL(`https://bookwalker.jp/search/?keyword=${query}`);
  };

  const openMangaUpdatesSearch = (title) => {
    const query = encodeURIComponent(title);
    Linking.openURL(`https://www.mangaupdates.com/search.html?search=${query}`);
  };

  // Convert HTML synopsis text
  const cleanDescription = (htmlText) => {
    if (!htmlText) return '';
    return htmlText
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim();
  };

  const renderThresholdController = () => {
    return (
      <View style={[styles.thresholdContainer, { borderTopColor: isDarkMode ? '#2A2A2A' : '#E0E0E0' }]}>
        <View style={styles.thresholdRow}>
          <Ionicons name="filter-outline" size={16} color={isDarkMode ? '#AAA' : '#666'} />
          <Text style={[styles.thresholdLabel, { color: isDarkMode ? '#FFF' : '#333' }]}>Match Similarity Threshold</Text>
          <Text style={styles.thresholdValue}>{Math.round(similarityThreshold * 100)}%</Text>
        </View>
        
        <View style={styles.thresholdButtonsRow}>
          <TouchableOpacity 
            style={[styles.thresholdStepBtn, { backgroundColor: isDarkMode ? '#2D2D2D' : '#E0E0E0' }]} 
            onPress={() => setSimilarityThreshold(Math.max(0.5, parseFloat((similarityThreshold - 0.05).toFixed(2))))}
          >
            <Ionicons name="remove" size={18} color={isDarkMode ? '#FFF' : '#333'} />
          </TouchableOpacity>

          {[0.55, 0.70, 0.85, 1.00].map((val) => (
            <TouchableOpacity 
              key={val}
              style={[
                styles.thresholdSegmentBtn, 
                similarityThreshold === val && { backgroundColor: COLORS.primary }
              ]}
              onPress={() => setSimilarityThreshold(val)}
            >
              <Text style={[
                styles.thresholdSegmentText, 
                { color: similarityThreshold === val ? '#FFF' : (isDarkMode ? '#AAA' : '#666') }
              ]}>
                {Math.round(val * 100)}%
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity 
            style={[styles.thresholdStepBtn, { backgroundColor: isDarkMode ? '#2D2D2D' : '#E0E0E0' }]} 
            onPress={() => setSimilarityThreshold(Math.min(1.0, parseFloat((similarityThreshold + 0.05).toFixed(2))))}
          >
            <Ionicons name="add" size={18} color={isDarkMode ? '#FFF' : '#333'} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Animations values
  const translateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 240], // Height of image preview container
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? '#121212' : '#F5F5F5' }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isDarkMode ? '#2A2A2A' : '#E0E0E0' }]}>
        <Ionicons name="scan-circle" size={32} color={COLORS.primary} />
        <Text style={[styles.headerTitle, { color: isDarkMode ? '#FFF' : '#333' }]}>OtakuLens</Text>
        <Text style={styles.headerSub}>Scene Finder & LN Tracker</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Upload Zone */}
        {!selectedImage ? (
          <View style={[styles.uploadBox, { backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF', borderColor: isDarkMode ? '#333' : '#CCC' }]}>
            <Ionicons name="image-outline" size={64} color={isDarkMode ? '#444' : '#BBB'} style={{ marginBottom: 15 }} />
            <Text style={[styles.uploadText, { color: isDarkMode ? '#FFF' : '#333' }]}>Select an Anime or Manga Scene</Text>
            <Text style={styles.uploadSubText}>Upload an image or screenshot to identify its source details and track volume release updates.</Text>

            <View style={styles.uploadButtons}>
              <TouchableOpacity style={[styles.pickBtn, { backgroundColor: COLORS.primary }]} onPress={pickImage}>
                <Ionicons name="images-outline" size={18} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.btnText}>Gallery</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.pickBtn, { backgroundColor: '#34495e' }]} onPress={takePhoto}>
                <Ionicons name="camera-outline" size={18} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.btnText}>Camera</Text>
              </TouchableOpacity>
            </View>

            {renderThresholdController()}
          </View>
        ) : (
          /* Preview and Action Zone */
          <View style={[styles.previewContainer, { backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF' }]}>
            <View style={styles.imageFrame}>
              <Image source={{ uri: selectedImage }} style={styles.previewImage} resizeMode="cover" />
              
              {/* Scanning Laser Animation overlay */}
              {loading && (
                <View style={StyleSheet.absoluteFill}>
                  <Animated.View style={[styles.scanLine, { transform: [{ translateY }] }]} />
                  <Animated.View style={[styles.scanOverlay, { opacity: 0.3 }]} />
                </View>
              )}
            </View>

            {/* Loading Indicator */}
            {loading && (
              <View style={styles.loadingOverlay}>
                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  <Ionicons name="aperture" size={40} color={COLORS.primary} />
                </Animated.View>
                <Text style={styles.loadingText}>Analyzing visual frames...</Text>
              </View>
            )}

            {/* Error Message */}
            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={24} color="#e74c3c" style={{ marginRight: 10 }} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Similarity Threshold Controller */}
            {!loading && renderThresholdController()}

            {/* Buttons */}
            {!loading && (
              <View style={styles.actionButtons}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#7f8c8d' }]} onPress={resetAll}>
                  <Ionicons name="trash-outline" size={20} color="#FFF" />
                  <Text style={[styles.btnText, { marginLeft: 5 }]}>Clear</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.primary, flex: 2 }]} onPress={analyzeScene}>
                  <Ionicons name="eye-outline" size={20} color="#FFF" />
                  <Text style={[styles.btnText, { marginLeft: 8 }]}>Identify Scene</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Results Panels */}
        {animeMatch && animeDetails && (
          <View style={styles.resultsContainer}>
            {/* Anime Match Panel */}
            <View style={[styles.card, { backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF' }]}>
              <View style={styles.cardHeaderBadge}>
                <View style={[styles.badge, animeMatch.similarity < 0.75 && { backgroundColor: 'rgba(230, 126, 34, 0.15)' }]}>
                  <Text style={[styles.badgeText, animeMatch.similarity < 0.75 && { color: '#e67e22' }]}>
                    {animeMatch.similarity < 0.75 ? 'LOW CONFIDENCE MATCH' : 'ANIME MATCHED'}
                  </Text>
                </View>
                <Text style={[styles.matchScore, animeMatch.similarity < 0.75 && { color: '#e67e22' }]}>
                  {Math.round(animeMatch.similarity * 1000) / 10}% confidence
                </Text>
              </View>

              <Text style={[styles.animeTitle, { color: isDarkMode ? '#FFF' : '#333' }]}>
                {animeDetails.title.english || animeDetails.title.romaji}
              </Text>
              {animeDetails.title.english && (
                <Text style={styles.romajiSubtitle}>{animeDetails.title.romaji}</Text>
              )}

              <View style={[styles.divider, { backgroundColor: isDarkMode ? '#2A2A2A' : '#E0E0E0' }]} />

              <View style={styles.metaGrid}>
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>EPISODE</Text>
                  <Text style={[styles.metaVal, { color: isDarkMode ? '#FFF' : '#333' }]}>
                    {animeMatch.episode || 'Movie/OVA'}
                  </Text>
                </View>
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>TIMECODE</Text>
                  <Text style={[styles.metaVal, { color: isDarkMode ? '#FFF' : '#333' }]}>
                    {formatTimecode(animeMatch.from)}
                  </Text>
                </View>
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>STATUS</Text>
                  <Text style={[styles.metaVal, { color: COLORS.primary }]}>
                    {animeDetails.status}
                  </Text>
                </View>
              </View>
            </View>

            {/* Alternative Matches Section */}
            {candidatesList.length > 1 && (
              <View style={{ marginBottom: 20 }}>
                <Text style={[styles.sectionTitle, { color: isDarkMode ? '#FFF' : '#444', marginTop: 10 }]}>
                  Alternative Matches
                </Text>
                
                <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.alternativesRow}>
                  {candidatesList.map((candidate) => {
                    // Skip if currently active
                    if (candidate.id === animeDetails.id) return null;

                    const match = traceMatches.find(m => m.anilist === candidate.id);
                    if (!match) return null;

                    return (
                      <TouchableOpacity 
                        key={candidate.id}
                        style={[
                          styles.alternativeCard, 
                          { backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF' }
                        ]}
                        onPress={() => handleSelectCandidate(candidate.id)}
                        activeOpacity={0.7}
                      >
                        <Image source={{ uri: candidate.coverImage.large }} style={styles.alternativeThumb} resizeMode="cover" />
                        <View style={styles.alternativeInfo}>
                          <Text style={[styles.alternativeTitle, { color: isDarkMode ? '#FFF' : '#333' }]} numberOfLines={2}>
                            {candidate.title.english || candidate.title.romaji}
                          </Text>
                          <View style={styles.alternativeMeta}>
                            <Text style={styles.alternativeConfidence}>
                              {Math.round(match.similarity * 1000) / 10}% match
                            </Text>
                            <Text style={styles.alternativeEp}>
                              Ep {match.episode || 'Movie'}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Source Novel / Manga Panel */}
            <Text style={[styles.sectionTitle, { color: isDarkMode ? '#FFF' : '#444' }]}>Source Material & Releases</Text>

            {sourceMaterial.length === 0 ? (
              <View style={[styles.card, { backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF', alignItems: 'center', padding: 20 }]}>
                <Ionicons name="book-outline" size={40} color="#666" style={{ marginBottom: 10 }} />
                <Text style={{ color: isDarkMode ? '#FFF' : '#333', textAlign: 'center', fontWeight: 'bold' }}>No Source Adaptation Found</Text>
                <Text style={{ color: '#888', textAlign: 'center', fontSize: 12, marginTop: 4 }}>This anime may be an original production without light novel or manga sources.</Text>
              </View>
            ) : (
              sourceMaterial.map((source) => {
                const isNovel = source.format === 'NOVEL';
                const statusColor = source.status === 'RELEASING' ? '#2ecc71' : (source.status === 'FINISHED' ? '#3498db' : '#e74c3c');
                
                return (
                  <View key={source.id} style={[styles.card, { backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF' }]}>
                    <View style={styles.sourceHeader}>
                      <Image source={{ uri: source.coverImage.large }} style={styles.sourceCover} resizeMode="cover" />
                      
                      <View style={styles.sourceMeta}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                          <View style={[styles.typeBadge, { backgroundColor: isNovel ? '#8e44ad' : '#d35400' }]}>
                            <Text style={styles.typeBadgeText}>{isNovel ? 'LIGHT NOVEL' : 'MANGA'}</Text>
                          </View>
                          <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
                          <Text style={[styles.statusText, { color: statusColor }]}>{source.status}</Text>
                        </View>

                        <Text style={[styles.sourceTitleText, { color: isDarkMode ? '#FFF' : '#333' }]} numberOfLines={2}>
                          {source.title.english || source.title.romaji}
                        </Text>
                        
                        <Text style={styles.sourceVolumesCount}>
                          {source.volumes ? `${source.volumes} Volumes` : 'Volume count unknown'}
                        </Text>
                      </View>
                    </View>

                    {source.description && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={styles.synopsisLabel}>SYNOPSIS</Text>
                        <Text style={[styles.synopsisText, { color: isDarkMode ? '#BBB' : '#555' }]} numberOfLines={3}>
                          {cleanDescription(source.description)}
                        </Text>
                      </View>
                    )}

                    <View style={[styles.divider, { backgroundColor: isDarkMode ? '#2A2A2A' : '#E0E0E0' }]} />

                    {/* Smart volume updates lookup actions */}
                    <Text style={styles.updatesTitle}>Track Release Updates</Text>
                    
                    <TouchableOpacity 
                      style={[styles.updateBtn, { backgroundColor: COLORS.primary }]}
                      onPress={() => searchVolumeUpdates(source.title.english || source.title.romaji, source.format, source.volumes)}
                    >
                      <Ionicons name="search" size={18} color="#FFF" style={{ marginRight: 8 }} />
                      <Text style={styles.btnText}>
                        Search {source.volumes ? `Volume ${source.volumes + 1}` : 'Next Volume'} Release Date
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.externalLinksGrid}>
                      <TouchableOpacity style={[styles.linkBtn, { backgroundColor: isDarkMode ? '#2A2A2A' : '#EAEAEA' }]} onPress={() => openBookWalkerSearch(source.title.english || source.title.romaji)}>
                        <Ionicons name="cart-outline" size={16} color={isDarkMode ? '#FFF' : '#333'} />
                        <Text style={[styles.linkBtnText, { color: isDarkMode ? '#FFF' : '#333' }]}>BookWalker</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={[styles.linkBtn, { backgroundColor: isDarkMode ? '#2A2A2A' : '#EAEAEA' }]} onPress={() => openMangaUpdatesSearch(source.title.english || source.title.romaji)}>
                        <Ionicons name="list" size={16} color={isDarkMode ? '#FFF' : '#333'} />
                        <Text style={[styles.linkBtnText, { color: isDarkMode ? '#FFF' : '#333' }]}>MangaUpdates</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
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
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginLeft: 10,
    flex: 1,
  },
  headerSub: {
    fontSize: 10,
    color: '#888',
    alignSelf: 'flex-end',
    marginBottom: 4,
  },
  scrollContainer: {
    padding: 15,
    paddingBottom: 40,
  },
  uploadBox: {
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 280,
  },
  uploadText: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  uploadSubText: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  uploadButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 15,
  },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    flex: 1,
    marginHorizontal: 5,
  },
  btnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  previewContainer: {
    borderRadius: 16,
    padding: 15,
    alignItems: 'center',
  },
  imageFrame: {
    width: '100%',
    height: 240,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 5,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.primary,
  },
  loadingOverlay: {
    marginTop: 20,
    alignItems: 'center',
  },
  loadingText: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 8,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderColor: 'rgba(231, 76, 60, 0.3)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 15,
    width: '100%',
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 13,
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 15,
    width: '100%',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    marginHorizontal: 5,
    flex: 1,
  },
  resultsContainer: {
    marginTop: 20,
  },
  card: {
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeaderBadge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  badge: {
    backgroundColor: 'rgba(58, 123, 213, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: 'bold',
  },
  matchScore: {
    color: '#2ecc71',
    fontSize: 12,
    fontWeight: '600',
  },
  animeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 26,
  },
  romajiSubtitle: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    marginVertical: 15,
  },
  metaGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaCol: {
    alignItems: 'center',
    flex: 1,
  },
  metaLabel: {
    fontSize: 9,
    color: '#888',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  metaVal: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 15,
  },
  sourceHeader: {
    flexDirection: 'row',
  },
  sourceCover: {
    width: 80,
    height: 120,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  sourceMeta: {
    flex: 1,
    marginLeft: 15,
    justifyContent: 'flex-start',
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  typeBadgeText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: 'bold',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  sourceTitleText: {
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 22,
    marginTop: 8,
  },
  sourceVolumesCount: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  synopsisLabel: {
    fontSize: 9,
    color: '#888',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  synopsisText: {
    fontSize: 12,
    lineHeight: 18,
  },
  updatesTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#888',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  externalLinksGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 3,
  },
  linkBtnText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  thresholdContainer: {
    width: '100%',
    marginVertical: 15,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  thresholdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  thresholdLabel: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginLeft: 8,
  },
  thresholdValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  thresholdButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  thresholdStepBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thresholdSegmentBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  thresholdSegmentText: {
    fontSize: 11,
    fontWeight: '600',
  },
  alternativesRow: {
    flexDirection: 'row',
    paddingVertical: 5,
  },
  alternativeCard: {
    flexDirection: 'row',
    width: 260,
    borderRadius: 12,
    padding: 8,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
  },
  alternativeThumb: {
    width: 45,
    height: 65,
    borderRadius: 6,
    backgroundColor: '#333',
  },
  alternativeInfo: {
    flex: 1,
    marginLeft: 10,
    justifyContent: 'center',
  },
  alternativeTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    lineHeight: 16,
  },
  alternativeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  alternativeConfidence: {
    fontSize: 10,
    color: '#2ecc71',
    fontWeight: '600',
  },
  alternativeEp: {
    fontSize: 10,
    color: '#888',
  },
});
