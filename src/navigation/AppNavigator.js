import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { getSettings, subscribeToSettings } from '../utils/storage';

// Screens
import SplashScreen from '../screens/SplashScreen';
import LibraryScreen from '../screens/LibraryScreen';
import ReaderScreen from '../screens/ReaderScreen';
import BookmarksScreen from '../screens/BookmarksScreen';
import FilesScreen from '../screens/FilesScreen';
import CustomizeToolbarScreen from '../screens/CustomizeToolbarScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabNavigator() {
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    const loadInitial = async () => {
      const settings = await getSettings();
      setIsDarkMode(settings.darkMode);
    };
    loadInitial();

    const unsubscribe = subscribeToSettings((newSettings) => {
      setIsDarkMode(newSettings.darkMode);
    });
    return unsubscribe;
  }, []);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        headerStyle: {
          backgroundColor: COLORS.primary,
        },
        headerTintColor: COLORS.card,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Library') {
            iconName = focused ? 'library' : 'library-outline';
          } else if (route.name === 'Bookmarks') {
            iconName = focused ? 'bookmarks' : 'bookmarks-outline';
          } else if (route.name === 'Files') {
            iconName = focused ? 'folder' : 'folder-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
          backgroundColor: isDarkMode ? '#1E1E1E' : '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: isDarkMode ? '#2A2A2A' : '#E0E0E0',
          height: 60,
          paddingBottom: 8,
        },
      })}
    >
      <Tab.Screen name="Library" component={LibraryScreen} />
      <Tab.Screen name="Bookmarks" component={BookmarksScreen} />
      <Tab.Screen name="Files" component={FilesScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Splash">
        <Stack.Screen 
          name="Splash" 
          component={SplashScreen} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="Main" 
          component={TabNavigator} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="Reader" 
          component={ReaderScreen} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="CustomizeToolbar" 
          component={CustomizeToolbarScreen} 
          options={{ presentation: 'modal', headerShown: false }} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
