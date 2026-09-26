import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { MESSAGE_TYPES } from '../shared/protocol.js';

export class GeoFSDiscordBot {
  constructor({ token, channelId, server }) {
    this.token = token;
    this.channelId = channelId;
    this.server = server;
    this.client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
    this.ready = false;
    this.channel = null;
  }

  async start() {
    if (!this.token) {
      throw new Error('DISCORD_BOT_TOKEN is required');
    }

    this.client.on('ready', () => {
      this.ready = true;
      this.channel = this.client.channels.cache.get(this.channelId) || null;
      this.server?.setDiscordStatus('online');
    });

    await this.client.login(this.token);
  }

  async sendStatusEmbed(status) {
    const channel = this.channel || await this.getChannel();
    if (!channel) return null;
    const embed = new EmbedBuilder()
      .setTitle('🌐 GeoFS Multiplayer')
      .setColor(0x4ecdc4)
      .addFields(
        { name: 'Status', value: status?.status || 'Online', inline: true },
        { name: 'Players', value: String(status?.players ?? 0), inline: true },
        { name: 'Ping', value: `${status?.ping ?? 0} ms`, inline: true }
      );
    return channel.send({ embeds: [embed] });
  }

  async sendPlayerEmbed(player) {
    const channel = this.channel || await this.getChannel();
    if (!channel || !player) return null;
    const embed = new EmbedBuilder()
      .setTitle(`✈️ ${player.callsign || 'PLAYER'}`)
      .setColor(0x5dade2)
      .addFields(
        { name: 'Aircraft', value: String(player.aircraft || 'Unknown'), inline: true },
        { name: 'Altitude', value: `${Math.round(Number(player.altitude || 0))} ft`, inline: true },
        { name: 'Speed', value: `${Math.round(Number(player.speed || 0))} kt`, inline: true },
        { name: 'Heading', value: `${Math.round(Number(player.heading || 0))}°`, inline: true },
        { name: 'Position', value: `${Number(player.latitude || 0).toFixed(4)}, ${Number(player.longitude || 0).toFixed(4)}`, inline: false },
        { name: 'Gear', value: Number(player.gear || 0) ? 'DOWN' : 'UP', inline: true }
      );
    return channel.send({ embeds: [embed] });
  }

  async sendChatEmbed(entry) {
    const channel = this.channel || await this.getChannel();
    if (!channel || !entry) return null;
    const embed = new EmbedBuilder()
      .setTitle('💬 GeoFS Chat')
      .setColor(0x00b894)
      .addFields(
        { name: 'Pilot', value: entry.callsign || 'UNKNOWN', inline: true },
        { name: 'Message', value: entry.message || '', inline: false }
      );
    return channel.send({ embeds: [embed] });
  }

  async getChannel() {
    if (!this.channelId) return null;
    const guild = await this.client.guilds.fetch();
    if (!guild.first()) return null;
    return this.client.channels.cache.get(this.channelId) || await this.client.channels.fetch(this.channelId).catch(() => null);
  }

  async sendToGeoFS(message) {
    if (!this.server) return null;
    return this.server.broadcastToGeoFS(message);
  }

  getGeoFSPlayers() {
    if (!this.server) return [];
    return [...this.server.state.players.values()];
  }

  getGeoFSPlayer(id) {
    return this.server?.state?.players?.get(id) || null;
  }

  getGeoFSPlayerByCallsign(callsign) {
    const normalized = String(callsign || '').toLowerCase();
    return [...(this.server?.state?.players?.values?.() || [])].find((player) => String(player.callsign || '').toLowerCase() === normalized) || null;
  }

  getGeoFSStatus() {
    return {
      status: this.server?.state?.serverStatus || 'online',
      players: this.server?.state?.players?.size || 0,
      ping: this.server?.state?.lastDiscordPing || 0,
    };
  }

  getGeoFSPing() {
    return this.server?.state?.lastDiscordPing || 0;
  }

  getGeoFSPlayerCount() {
    return this.server?.state?.players?.size || 0;
  }

  sendGeoFSChat(message) {
    return this.sendToGeoFS({
      type: MESSAGE_TYPES.DISCORD_CHAT,
      message,
    });
  }
}
