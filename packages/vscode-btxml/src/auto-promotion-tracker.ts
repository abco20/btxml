export function createAutoPromotionTracker() {
  const autoPromotedLanguageIds = new Map<string, string>();
  const pendingLanguageSwitchCloseSkips = new Set<string>();
  const pendingLanguageSwitchReopens = new Set<string>();

  return {
    get(uri: string) {
      return autoPromotedLanguageIds.get(uri);
    },
    clear(uri: string) {
      autoPromotedLanguageIds.delete(uri);
      pendingLanguageSwitchCloseSkips.delete(uri);
      pendingLanguageSwitchReopens.delete(uri);
    },
    markLanguageSwitch(uri: string) {
      pendingLanguageSwitchCloseSkips.add(uri);
    },
    rollbackLanguageSwitch(uri: string) {
      pendingLanguageSwitchCloseSkips.delete(uri);
    },
    preserveOnClose(uri: string) {
      if (!pendingLanguageSwitchCloseSkips.delete(uri)) return false;
      pendingLanguageSwitchReopens.add(uri);
      return true;
    },
    finishReopen(uri: string) {
      pendingLanguageSwitchReopens.delete(uri);
    },
    setPromotedFromLanguage(uri: string, languageId: string) {
      autoPromotedLanguageIds.set(uri, languageId);
    },
  };
}
