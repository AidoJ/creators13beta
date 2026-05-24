import { useEffect, useState } from "react";

const STORAGE_KEY = "discord-chat-open";

export function useDiscordChatPrefs(defaultOpen = true) {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? defaultOpen : stored === "true";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, String(isOpen));
  }, [isOpen]);

  return { isOpen, setIsOpen, toggle: () => setIsOpen((v) => !v) };
}
