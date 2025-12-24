const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// إضافة تكوين خاص بـ Metro Bundler لتجاهل react-native-maps على الويب
config.resolver.resolverMainFields.unshift('react-native', 'browser', 'main');
config.resolver.sourceExts.push('jsx', 'js', 'ts', 'tsx', 'json', 'wasm', 'mjs', 'cjs');

// تجاهل react-native-maps على الويب
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// ربط react-native-maps بملف mock خاص بنا على الويب
config.resolver.extraNodeModules = {
  'react-native-maps': path.resolve(__dirname, 'mocks/react-native-maps.web.js'),
};
// for metro-symlinks (if needed)
config.resolver.alias = {
  ...(config.resolver.alias || {}),
  'react-native-maps': path.resolve(__dirname, 'mocks/react-native-maps.web.js'),
};


module.exports = config;

