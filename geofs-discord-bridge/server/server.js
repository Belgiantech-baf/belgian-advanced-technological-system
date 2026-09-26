import 'dotenv/config';
import { GeoFSBridgeServer } from './websocket.js';
import { GeoFSDiscordBot } from '../bot/discord.js';
import { getCommandResponse, parseGeoCommand } from '../bot/commands.js';
import { MESSAGE_TYPES } from '../shared/protocol.js';

const PORT = Number(process.env.PORT || 3000);
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || 'change-me';
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const state = {
  players: new Map(),
  serverStatus: 'online',
  discordStatus: 'offline',
  lastDiscordPing: 0,
};

const bridge = new GeoFSBridgeServer({
  port: PORT,
  bridgeSecret: BRIDGE_SECRET,
  onPlayerUpdate(player) {
    state.players.set(player.id, player);
  },
  onChat(chat) {
    console.log('GeoFS chat event', chat);
  },
  onStatus(snapshot) {
    state.players = new Map(Object.entries(snapshot.players || {}));
    state.serverStatus = snapshot.serverStatus;
    state.discordStatus = snapshot.discordStatus;
  },
});

const bot = new GeoFSDiscordBot({
  token: DISCORD_TOKEN,
  channelId: CHANNEL_ID,
  server: {
    state,
    setDiscordStatus(value) {
      state.discordStatus = value;
    },
    broadcastToGeoFS(message) {
      return bridge.broadcastToGeoFS(message);
    },
  },
});

bridge.start();

bot.client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!geo')) return;
  const parsed = parseGeoCommand(message.content);
  if (!parsed) return;
  const response = getCommandResponse(parsed.command, parsed.args, { state, broadcastToGeoFS: (msg) => bridge.broadcastToGeoFS(msg) });
  await message.reply(response);
});

try {
  await bot.start();
  console.log('Discord bot connected');
  state.discordStatus = 'online';
  bridge.emitStatus();
} catch (error) {
  console.error('Discord bot failed to start', error.message);
  state.discordStatus = 'offline';
}

setInterval(() => {
  const payload = {
    type: MESSAGE_TYPES.PLAYER_COUNT,
    players: bridge.state.players.size,
    timestamp: Date.now(),
  };
  bridge.broadcast(payload);
}, 5000);

console.log(`Bridge running on ws://localhost:${PORT}`);
