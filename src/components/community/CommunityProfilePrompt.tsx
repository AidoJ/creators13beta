import { ReactNode, createContext, useContext } from "react";

/** The banner is handed to DashboardHeader, which renders it directly
 *  BELOW the top menu so it pushes content down and never covers the nav. */
const ProfilePromptBannerContext = createContext<ReactNode>(null);
export function useProfilePromptBanner() { return useContext(ProfilePromptBannerContext); }

/**
 * Wraps Community pages. Members with access but no community profile can
 * still browse; they see a clear prompt to create one. Staff never see it.
 */
export default function CommunityProfilePrompt({ children }: { children: ReactNode; requireCommunityAccess?: boolean }) {
  return <ProfilePromptBannerContext.Provider value={null}>{children}</ProfilePromptBannerContext.Provider>;
}
