# Belgian Advanced Technology System

Belgian Advanced Technology System is a lightweight web radar that shows live aircraft, lets you filter callsigns, and displays detailed information for each player of GeoFS in real time.

Live site: https://geofs-live-radar.onrender.com


## Features

- Custom callsign filtering (add or remove filters yourself)
- Light / dark theme with automatic saving
- Aircraft details (type, altitude, speed, heading, callsign, etc.)
- Discord bot commands and automatic Belgium entry/exit alerts

## Discord bot

Install dependencies and set both environment variables before starting the application:

```powershell
pip install -r requirements.txt
$env:DISCORD_BOT_TOKEN = "your-bot-token"
$env:DISCORD_CHANNEL_ID = "123456789012345678"
python .\geofs_live_radar.py
```

Never commit the token. The bot requires Discord Message Content Intent and permission to view, send messages, and embed links in the configured channel. Automatic alerts and commands are restricted to `DISCORD_CHANNEL_ID`.

Commands:

- `!status` shows monitoring status and tracked aircraft count.
- `!belgium` lists aircraft currently inside the Belgium bounding box.
- `!aircraft <id>` shows the latest position, altitude, and callsign.
- `!stats` shows aircraft seen today, entries, exits, and aircraft currently inside.
- `!help` lists available commands.

Staff can use `!tag addbaf` and `!tag removebaf` to enable or disable the persisted `[BAF]` Belgian Air Force callsign preset. `!scramble status` reports whether BAF monitoring is enabled.

## GeoFS chat logger

Chat logging is persisted in `chat_logger_config.json` and sends blue embeds to Discord channel `1497398101667745942` when chat records are present in the GeoFS response. Commands are used in the configured bot channel:

- `!chatlog on` / `!chatlog off` enable or disable logging; staff permissions are required.
- `!chatlog status` shows logger state, destination channel, and today's processed count.
- `!chatfilter add <word>` / `!chatfilter remove <word>` manage keyword notices; staff permissions are required.
- `!chatfilter list` lists configured keywords.

The parser supports chat lists exposed as `chat`, `messages`, or `chatMessages` and ignores unknown response shapes. It de-duplicates stable message IDs or content fingerprints and queues Discord delivery asynchronously.

## Wispbyte deployment

Upload the contents of the nested `geofs-live-radar-main` application folder to Wispbyte. Use:

```text
Install command: pip install -r requirements.txt
Start command: python start.py
```

Configure these as Wispbyte environment variables/secrets:

```text
DISCORD_BOT_TOKEN=<rotated bot token>
DISCORD_CHANNEL_ID=<numeric command channel ID>
DISCORD_WEBHOOK_URL=<rotated webhook URL>
TEST_MODE=false
PORT=<Wispbyte-provided port, if required>
```

The application binds Flask to `0.0.0.0` and reads the platform `PORT`. The `start.py` entry point launches both the Discord bot and radar through the existing live startup validation. Do not upload `.env`; use Wispbyte's secret/environment-variable settings instead.

The bot uses embeds titled **GeoFS Belgium Monitor**. If either bot variable is missing or invalid, the web radar continues to run and the bot remains disabled.

## Safe validation

Copy `.env.example` to `.env`, set `TEST_MODE=true`, and run the offline validator:

```powershell
python .\validate_discord.py
```

In test mode, the application does not log in to Discord, does not send messages, and serves one synthetic aircraft inside the Belgium zone instead of calling GeoFS. The validator logs only whether configuration values are present or valid; it never prints token or webhook contents. For live startup testing, first revoke any exposed token, create a new token, correct the numeric channel ID, set `TEST_MODE=false`, and run the application. Startup fails closed unless credentials are non-placeholder, the webhook responds to a non-posting reachability check, and the channel ID is numeric. It sends exactly one `GeoFS Belgium Monitor is online.` embed after the channel is resolved and permissions are verified.


## Contributors

- **[bismarck017](https://github.com/bismarck017)**
- **[BigBoi69](https://discord.com/users/702415876904976424)**


## Contact

Discord: [massiv4515_](https://discord.com/users/1421366810200244246)  
Email: massiv4515@gmail.com  
GitHub: [Massiv4515](https://github.com/Massiv4515)


## License

This project is licensed under **GNU General Public License v3.0 (GPL-3.0)**.

You are free to use, study, modify, and share this project — but any
derivative work must also remain open-source under GPL-3.0.

See the full license in the **LICENSE** file.
