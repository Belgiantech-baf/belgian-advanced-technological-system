export function parseGeoCommand(message) {
  const text = String(message || '').trim();
  if (!text.startsWith('!geo')) return null;
  const [command, ...args] = text.replace(/^!geo\s*/i, '').split(/\s+/);
  return { command: (command || '').toLowerCase(), args };
}

export function getCommandResponse(command, args, server) {
  const players = [...(server?.state?.players?.values?.() || [])];
  switch (command) {
    case 'status': {
      return `GeoFS Multiplayer\n-----------------\nStatus: ${server?.state?.serverStatus || 'online'}\nPlayers: ${players.length}\nPing: ${server?.state?.lastDiscordPing || 0} ms\nServer time: ${new Date().toISOString()}`;
    }
    case 'players': {
      if (!players.length) return 'Current GeoFS Players\n---------------------\nNo players connected.';
      return ['Current GeoFS Players', '---------------------', ...players.slice(0, 10).map((player) => `${player.callsign || 'UNKNOWN'}\nAircraft: ${player.aircraft || 'Unknown'}\nAltitude: ${Math.round(Number(player.altitude || 0))} ft\nSpeed: ${Math.round(Number(player.speed || 0))} kt`)].join('\n');
    }
    case 'player': {
      const target = args[0] || '';
      const player = players.find((entry) => String(entry.callsign || '').toLowerCase() === target.toLowerCase());
      if (!player) return `No player found for ${target}.`;
      return [
        'Callsign: ' + (player.callsign || 'UNKNOWN'),
        'GeoFS ID: ' + (player.id || 'UNKNOWN'),
        'Aircraft: ' + (player.aircraft || 'Unknown'),
        'Latitude: ' + Number(player.latitude || 0).toFixed(4),
        'Longitude: ' + Number(player.longitude || 0).toFixed(4),
        'Altitude: ' + Math.round(Number(player.altitude || 0)) + ' ft',
        'Heading: ' + Math.round(Number(player.heading || 0)) + '°',
        'Pitch: ' + Number(player.pitch || 0),
        'Roll: ' + Number(player.roll || 0),
        'Speed: ' + Math.round(Number(player.speed || 0)) + ' kt',
        'Gear: ' + (Number(player.gear || 0) ? 'DOWN' : 'UP'),
      ].join('\n');
    }
    case 'me': {
      const local = players[0];
      if (!local) return 'No local GeoFS player available.';
      return [
        'GeoFS ID: ' + (local.id || 'UNKNOWN'),
        'Callsign: ' + (local.callsign || 'UNKNOWN'),
        'Aircraft: ' + (local.aircraft || 'Unknown'),
        'Position: ' + Number(local.latitude || 0).toFixed(4) + ', ' + Number(local.longitude || 0).toFixed(4),
        'Altitude: ' + Math.round(Number(local.altitude || 0)) + ' ft',
        'Speed: ' + Math.round(Number(local.speed || 0)) + ' kt',
        'Heading: ' + Math.round(Number(local.heading || 0)) + '°',
      ].join('\n');
    }
    case 'chat': {
      const text = args.join(' ');
      if (!text) return 'Usage: !geo chat <message>';
      server?.broadcastToGeoFS({ type: 'discord_chat', message: text });
      return `Queued message to GeoFS: ${text}`;
    }
    case 'help':
    case 'h':
      return ['!geo status', '!geo players', '!geo player <callsign>', '!geo me', '!geo chat <message>', '!geo help'].join('\n');
    default:
      return 'Unsupported command. Try !geo help.';
  }
}
