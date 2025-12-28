const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// إضافة تكوين خاص بـ Metro Bundler لتجاهل react-native-maps على الويب
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];
config.resolver.sourceExts.push('jsx', 'js', 'ts', 'tsx', 'json', 'wasm', 'mjs', 'cjs');

// تجاهل react-native-maps على الويب
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// ربط react-native-maps بملف mock خاص بنا على الويب
config.resolver.extraNodeModules = {
  'react-native-maps': path.resolve(__dirname, 'mocks/react-native-maps.web.js'),
};

// استخدام alias بشكل صحيح
config.resolver.alias = {
  ...(config.resolver.alias || {}),
  'react-native-maps': path.resolve(__dirname, 'mocks/react-native-maps.web.js'),
};

// منع استيراد الملفات المشكلة على الويب
config.resolver.blockList = [
  ...(config.resolver.blockList || []),
  /node_modules\/react-native-maps\/lib\/.*NativeComponent\.js$/,
];

// إضافة resolver custom للتعامل مع react-native-maps على الويب
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // استبدال react-native-maps بـ mock على الويب
  if (moduleName === 'react-native-maps' && (platform === 'web' || !platform)) {
    return {
      filePath: path.resolve(__dirname, 'mocks/react-native-maps.web.js'),
      type: 'sourceFile',
    };
  }
  
  // منع استيراد codegenNativeCommands على الويب
  if (moduleName.includes('codegenNativeCommands') && (platform === 'web' || !platform)) {
    return {
      filePath: path.resolve(__dirname, 'mocks/codegenNativeCommands.web.js'),
      type: 'sourceFile',
    };
  }
  
  // استخدام resolver الافتراضي
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

