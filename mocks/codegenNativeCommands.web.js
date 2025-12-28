// Mock for codegenNativeCommands on web
export default function codegenNativeCommands(commands) {
  // Return a mock object with empty functions
  const mockCommands = {};
  if (commands && commands.supportedCommands) {
    commands.supportedCommands.forEach((command) => {
      mockCommands[command] = () => {
        console.warn(`Native command ${command} is not supported on web`);
      };
    });
  }
  return mockCommands;
}

