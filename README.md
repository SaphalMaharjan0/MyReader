# SmartReader AI (MyReaderApp)

A feature-rich, offline-first native eBook reader application built with React Native and Expo. SmartReader AI provides a premium reading experience with advanced library management, customizability, and accessibility features.

## 🌟 Features

- **Advanced Library Management:** Organize your books with a beautiful grid UI. Filter and sort by Alphabetical, Series, Author, Tags, and Volume.
- **EPUB Support:** Robust local storage and EPUB metadata extraction, including reliable cover image extraction.
- **Moon+ Reader Integration:** Migrate your existing library from Moon+ Reader with our custom `.mrpro` archive parser.
- **Immersive Reading Experience:** Distraction-free reading interface with themes, screen orientation support, and a customizable user-defined toolbar.
- **Audio & Accessibility:** Real-time Text-to-Speech (TTS) highlighting, media session support for lock screen controls, and a sleep timer.
- **Customizable Toolbar:** Drag-and-drop customization interface to tailor your reader's navigation bar to your exact needs.
- **Theme & Settings Engine:** Fully customizable UI aesthetics for the library grid, reader, and application settings.

## 🚀 Tech Stack

- **Framework:** [React Native](https://reactnative.dev/) & [Expo](https://expo.dev/)
- **Navigation:** React Navigation (Native Stack & Bottom Tabs)
- **Storage:** AsyncStorage, Expo SQLite, Expo FileSystem
- **Core Utilities:** `fflate` (for archive parsing), `expo-speech` (for TTS), `react-native-webview` (for rendering)

## 📦 Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd MyReaderAppAntiGravity
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the application:**
   ```bash
   npm start
   # or
   npx expo start
   ```

   This will start the Expo development server. You can run the app on an Android emulator, an iOS simulator, or a physical device using the Expo Go app.

   - To run directly on Android: `npm run android`
   - To run directly on iOS: `npm run ios`

## 📁 Project Structure

- `src/screens/` - Application UI screens (Library, Reader, Settings, CustomizeToolbar, etc.)
- `src/navigation/` - React Navigation setup
- `src/utils/` - Helper functions, storage managers, and data parsers

## 🛠️ Development & Roadmap
- Continuous improvements to the `.mrpro` library parser
- Additional theme presets and typography options
- Expanded TTS voice and speed controls

## 📄 License

This project is private and intended for personal use.
