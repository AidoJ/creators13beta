/**
 * Discord chat panel configuration.
 *
 * The Discord server (guild) ID is public — it's safe to expose to the client.
 * To enable the in-game chat panel, A'Hara needs to:
 *   1. Invite the WidgetBot bot to the 13 Creators Discord server
 *      (https://widgetbot.io → "Add to Discord").
 *   2. Create a #card-game-lobby text channel (if it doesn't exist yet).
 *   3. With Discord developer mode on, right-click the channel → Copy ID
 *      and paste it below as LOBBY_CHANNEL_ID.
 *
 * Until LOBBY_CHANNEL_ID is set, the panel renders a friendly setup notice
 * instead of the chat iframe.
 */

export const DISCORD_GUILD_ID = "1390094847379406938"; // 13 Creators server
export const LOBBY_CHANNEL_ID = ""; // TODO: paste #card-game-lobby ID here

export const widgetBotUrl = (channelId: string) =>
  `https://e.widgetbot.io/channels/${DISCORD_GUILD_ID}/${channelId}`;

export const discordDeepLink = (channelId: string) =>
  `https://discord.com/channels/${DISCORD_GUILD_ID}/${channelId}`;
