"""Discord bot service for GeoFS Belgium monitoring."""

import asyncio
import logging
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import discord
from discord.ext import commands

logger = logging.getLogger(__name__)


class DiscordBotService:
    """Runs Discord commands and notifications without blocking Flask polling."""

    def __init__(
        self,
        get_snapshot,
        get_aircraft,
        get_stats,
        get_scramble_config,
        set_scramble_enabled,
        add_scramble_tag,
        remove_scramble_tag,
        clear_scramble_tags,
        scramble_role_id,
        get_chat_logger_config,
        set_chat_logging_enabled,
        add_chat_filter,
        remove_chat_filter,
        get_chat_stats,
        chat_log_channel_id,
    ):
        self.token = os.environ.get("DISCORD_BOT_TOKEN", "").strip()
        channel_value = os.environ.get("DISCORD_CHANNEL_ID", "").strip()
        self.test_mode = os.environ.get("TEST_MODE", "false").strip().lower() == "true"
        try:
            self.channel_id = int(channel_value) if channel_value else None
        except ValueError:
            logger.error("DISCORD_CHANNEL_ID must be an integer; Discord bot disabled")
            self.channel_id = None

        logger.info(
            "Environment loaded: DISCORD_BOT_TOKEN=%s DISCORD_CHANNEL_ID=%s DISCORD_WEBHOOK_URL=%s TEST_MODE=%s",
            "found" if self.token else "missing",
            "found" if self.channel_id is not None else "missing_or_invalid",
            "found" if os.environ.get("DISCORD_WEBHOOK_URL", "").strip() else "missing",
            self.test_mode,
        )

        self.get_snapshot = get_snapshot
        self.get_aircraft = get_aircraft
        self.get_stats = get_stats
        self.get_scramble_config = get_scramble_config
        self.set_scramble_enabled = set_scramble_enabled
        self.add_scramble_tag = add_scramble_tag
        self.remove_scramble_tag = remove_scramble_tag
        self.clear_scramble_tags = clear_scramble_tags
        self.scramble_role_id = scramble_role_id
        self.get_chat_logger_config = get_chat_logger_config
        self.set_chat_logging_enabled = set_chat_logging_enabled
        self.add_chat_filter = add_chat_filter
        self.remove_chat_filter = remove_chat_filter
        self.get_chat_stats = get_chat_stats
        self.chat_log_channel_id = chat_log_channel_id
        self.loop = None
        self.ready = False
        self.pending_events = []
        self.pending_lock = threading.Lock()
        self.thread = None

        intents = discord.Intents.default()
        intents.message_content = True
        self.bot = commands.Bot(command_prefix="!", intents=intents, help_command=None)
        self._register_handlers()

    @property
    def enabled(self):
        return bool(self.token and self.channel_id is not None and not self.test_mode)

    def start(self):
        if self.test_mode:
            logger.info("TEST_MODE enabled: Discord login and message delivery suppressed")
            return
        if not self.enabled:
            logger.info("Discord bot disabled: set DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID")
            return

        self.thread = threading.Thread(target=self._run, name="discord-bot", daemon=True)
        self.thread.start()

    def _run(self):
        try:
            self.bot.run(self.token, reconnect=True)
        except Exception:
            logger.exception("Discord bot stopped unexpectedly")

    def notify_event(self, event, aircraft_id, aircraft):
        """Queue an entry/exit event for asynchronous delivery."""
        if not self.enabled:
            return

        item = (event, str(aircraft_id), dict(aircraft))
        with self.pending_lock:
            self.pending_events.append(item)

        if self.loop and self.ready:
            asyncio.run_coroutine_threadsafe(self._flush_events(), self.loop)

    def notify_scramble(self, aircraft_id, aircraft, matched_tag):
        """Schedule one scramble alert on the Discord event loop."""
        if not self.enabled or not self.loop or not self.ready:
            return
        future = asyncio.run_coroutine_threadsafe(
            self._send_scramble_alert(aircraft_id, aircraft, matched_tag),
            self.loop,
        )
        future.add_done_callback(self._log_scramble_result)

    def notify_chat(self, chat_message):
        """Queue one deduplicated GeoFS chat record for Discord logging."""
        if not self.enabled or not self.loop or not self.ready:
            return
        future = asyncio.run_coroutine_threadsafe(self._send_chat_log(chat_message), self.loop)
        future.add_done_callback(self._log_chat_result)

    @staticmethod
    def _log_chat_result(future):
        try:
            future.result()
        except Exception:
            logger.exception("GeoFS chat log delivery failed")

    @staticmethod
    def _log_scramble_result(future):
        try:
            future.result()
        except Exception:
            logger.exception("Scramble alert delivery failed")

    async def _flush_events(self):
        with self.pending_lock:
            events = self.pending_events
            self.pending_events = []

        channel = self.bot.get_channel(self.channel_id)
        if channel is None:
            try:
                channel = await self.bot.fetch_channel(self.channel_id)
            except discord.DiscordException:
                logger.exception("Unable to access configured Discord channel")
                with self.pending_lock:
                    self.pending_events = events + self.pending_events
                return

        for event, aircraft_id, aircraft in events:
            try:
                await channel.send(embed=self._aircraft_embed(event, aircraft_id, aircraft))
                logger.info("Discord bot %s alert sent for aircraft %s", event, aircraft_id)
            except discord.DiscordException:
                logger.exception("Discord bot %s alert failed for aircraft %s", event, aircraft_id)

    async def _send_scramble_alert(self, aircraft_id, aircraft, matched_tag):
        channel = self.bot.get_channel(self.channel_id)
        if channel is None:
            channel = await self.bot.fetch_channel(self.channel_id)
        is_baf_alert = matched_tag.casefold() == "[baf]"
        embed = discord.Embed(
            title="✈️ BAF Aircraft Detected" if is_baf_alert else "🚨 SCRAMBLE ALERT",
            color=discord.Color.red(),
            timestamp=datetime.now(timezone.utc),
        )
        embed.add_field(name="Callsign", value=str(aircraft.get("name", "unknown")), inline=True)
        embed.add_field(name="Aircraft ID", value=str(aircraft_id), inline=True)
        embed.add_field(name="Aircraft Type", value=str(aircraft.get("aircraft_type", "unknown")), inline=True)
        embed.add_field(name="Latitude", value=str(aircraft.get("latitude", "unknown")), inline=True)
        embed.add_field(name="Longitude", value=str(aircraft.get("longitude", "unknown")), inline=True)
        embed.add_field(name="Altitude", value=f"{aircraft.get('altitude', 'unknown')} ft", inline=True)
        embed.add_field(name="Matched Tag", value=matched_tag, inline=True)
        embed.add_field(name="Detection Time (UTC)", value=str(aircraft.get("timestamp", "unknown")), inline=False)
        await channel.send(
            content=f"<@&{self.scramble_role_id}>",
            embed=embed,
            allowed_mentions=discord.AllowedMentions(roles=True),
        )
        logger.info("Scramble alert sent: aircraft=%s tag=%s", aircraft_id, matched_tag)

    async def _send_chat_log(self, chat_message):
        channel = self.bot.get_channel(self.chat_log_channel_id)
        if channel is None:
            channel = await self.bot.fetch_channel(self.chat_log_channel_id)
        embed = discord.Embed(title="💬 GeoFS Chat Log", color=discord.Color.blue())
        embed.add_field(name="User", value=chat_message["username"], inline=True)
        embed.add_field(name="Message", value=chat_message["message"][:1024], inline=False)
        embed.add_field(name="Timestamp", value=chat_message["timestamp"], inline=True)
        embed.add_field(name="Server", value=chat_message["server"][:1024], inline=True)
        await channel.send(embed=embed)
        logger.info("GeoFS chat log sent")

        for keyword in chat_message["matched_filters"]:
            notice = discord.Embed(title="🔎 GeoFS Chat Keyword Detected", color=discord.Color.orange())
            notice.add_field(name="Keyword", value=keyword, inline=True)
            notice.add_field(name="User", value=chat_message["username"], inline=True)
            notice.add_field(name="Message", value=chat_message["message"][:1024], inline=False)
            await channel.send(embed=notice)
            logger.info("GeoFS chat filter notice sent")

    def _register_handlers(self):
        @self.bot.event
        async def on_ready():
            self.loop = asyncio.get_running_loop()
            logger.info(
                "Bot connected: username=%s bot_id=%s connected_guilds=%s",
                self.bot.user,
                self.bot.user.id if self.bot.user else "unknown",
                len(self.bot.guilds),
            )
            scramble_config = self.get_scramble_config()
            logger.info(
                "Startup report: scramble_monitoring=%s configured_tags=%s baf_monitoring=%s role_id=%s",
                "ON" if scramble_config["enabled"] else "OFF",
                len(scramble_config["tags"]),
                "ENABLED" if any(tag.casefold() == "[baf]" for tag in scramble_config["tags"]) else "DISABLED",
                self.scramble_role_id,
            )
            chat_config = self.get_chat_logger_config()
            logger.info(
                "Startup report: chat_logger=%s log_channel_id=%s filters_loaded=%s",
                "ENABLED" if chat_config["enabled"] else "DISABLED",
                self.chat_log_channel_id,
                len(chat_config["filters"]),
            )
            channel = self.bot.get_channel(self.channel_id)
            if channel is None:
                try:
                    channel = await self.bot.fetch_channel(self.channel_id)
                except discord.NotFound:
                    logger.error("Configured Discord channel was not found: %s", self.channel_id)
                    return
                except discord.Forbidden:
                    logger.error("Bot lacks permission to resolve Discord channel: %s", self.channel_id)
                    return
                except discord.DiscordException:
                    logger.exception("Discord API error while resolving channel: %s", self.channel_id)
                    return
            logger.info("Channel resolved: channel_id=%s", channel.id)
            member = None
            if getattr(channel, "guild", None) is not None:
                member = channel.guild.get_member(self.bot.user.id)
                if member is None:
                    member = channel.guild.me
            if member is None:
                logger.error("Bot guild member could not be resolved for permission checks")
                return
            permissions = channel.permissions_for(member)
            required_permissions = ("view_channel", "send_messages", "embed_links", "read_message_history")
            missing_permissions = [
                name for name in required_permissions
                if not getattr(permissions, name, False)
            ]
            if missing_permissions:
                logger.error("Bot permissions insufficient: missing=%s", ",".join(missing_permissions))
                return
            logger.info("Bot permissions sufficient: required=view_channel,send_messages,embed_links,read_message_history")
            self.ready = True
            await self._send_startup_test(channel)
            await self._flush_events()

        @self.bot.event
        async def on_disconnect():
            self.ready = False
            logger.warning("Discord bot disconnected; discord.py will reconnect")

        @self.bot.event
        async def on_resumed():
            logger.info("Discord bot connection resumed")

        @self.bot.event
        async def on_command_error(ctx, error):
            if isinstance(error, (commands.CommandNotFound, commands.CheckFailure)):
                return
            logger.exception("Discord command failed: %s", error)
            await ctx.send("The command could not be completed.")

        @self.bot.check
        async def command_channel_check(ctx):
            return ctx.channel.id == self.channel_id

        def staff_only():
            async def predicate(ctx):
                permissions = getattr(ctx.author, "guild_permissions", None)
                return bool(permissions and (permissions.manage_guild or permissions.administrator))
            return commands.check(predicate)

        @self.bot.group(name="tag", invoke_without_command=True)
        async def tag(ctx):
            await ctx.send("Use `!tag add [TAG]`, `!tag remove [TAG]`, `!tag list`, or `!tag clear`.")

        @tag.command(name="add")
        @staff_only()
        async def tag_add(ctx, *, value: str):
            if self.add_scramble_tag(value):
                await ctx.send(f"Monitored tag added: `{value.strip()}`")
            else:
                await ctx.send("Tag was empty, too long, or already monitored.")

        @tag.command(name="remove")
        @staff_only()
        async def tag_remove(ctx, *, value: str):
            if self.remove_scramble_tag(value):
                await ctx.send(f"Monitored tag removed: `{value.strip()}`")
            else:
                await ctx.send("That tag is not currently monitored.")

        @tag.command(name="list")
        async def tag_list(ctx):
            config = self.get_scramble_config()
            tags = config["tags"]
            await ctx.send("Monitored tags: " + (", ".join(f"`{tag}`" for tag in tags) if tags else "none"))

        @tag.command(name="clear")
        @staff_only()
        async def tag_clear(ctx):
            self.clear_scramble_tags()
            await ctx.send("All monitored scramble tags cleared.")

        @tag.command(name="addbaf")
        @staff_only()
        async def tag_addbaf(ctx):
            await ctx.send("ℹ️ [BAF] monitoring is disabled.")

        @tag.command(name="removebaf")
        @staff_only()
        async def tag_removebaf(ctx):
            if self.remove_scramble_tag("[BAF]"):
                await ctx.send("✅ [BAF] monitoring removed.")
            else:
                await ctx.send("ℹ️ [BAF] is not currently monitored.")

        @self.bot.group(name="scramble", invoke_without_command=True)
        async def scramble(ctx):
            await ctx.send("Use `!scramble on`, `!scramble off`, or `!scramble status`.")

        @scramble.command(name="on")
        @staff_only()
        async def scramble_on(ctx):
            self.set_scramble_enabled(True)
            await ctx.send("Scramble monitoring enabled.")

        @scramble.command(name="off")
        @staff_only()
        async def scramble_off(ctx):
            self.set_scramble_enabled(False)
            await ctx.send("Scramble monitoring disabled.")

        @scramble.command(name="status")
        async def scramble_status(ctx):
            config = self.get_scramble_config()
            state = "ON" if config["enabled"] else "OFF"
            tags = ", ".join(config["tags"]) if config["tags"] else "none"
            baf_state = "ENABLED" if any(tag.casefold() == "[baf]" for tag in config["tags"]) else "DISABLED"
            await ctx.send(f"Scramble monitoring: **{state}**\nBAF Monitoring: **{baf_state}**\nMonitored tags ({len(config['tags'])}): {tags}")

        @self.bot.command(name="chatlog")
        async def chatlog(ctx, action: str = "status"):
            action = action.casefold()
            if action in ("on", "off"):
                permissions = getattr(ctx.author, "guild_permissions", None)
                if not permissions or not (permissions.manage_guild or permissions.administrator):
                    return
                self.set_chat_logging_enabled(action == "on")
                await ctx.send(f"GeoFS chat logging {'enabled' if action == 'on' else 'disabled'}.")
                return
            if action != "status":
                await ctx.send("Use `!chatlog on`, `!chatlog off`, or `!chatlog status`.")
                return
            config = self.get_chat_logger_config()
            stats = self.get_chat_stats()
            await ctx.send(
                f"Chat Logger: **{'ENABLED' if config['enabled'] else 'DISABLED'}**\n"
                f"Log Channel: `{self.chat_log_channel_id}`\n"
                f"Messages processed today: **{stats.get('processed_today', 0)}**"
            )

        @self.bot.command(name="chatfilter")
        async def chatfilter(ctx, action: str = "list", *, value: str = ""):
            action = action.casefold()
            permissions = getattr(ctx.author, "guild_permissions", None)
            if action in ("add", "remove") and (not permissions or not (permissions.manage_guild or permissions.administrator)):
                return
            if action == "add":
                await ctx.send("Chat filter added." if self.add_chat_filter(value) else "Filter was empty, too long, or already configured.")
            elif action == "remove":
                await ctx.send("Chat filter removed." if self.remove_chat_filter(value) else "That chat filter is not configured.")
            elif action == "list":
                filters = self.get_chat_logger_config()["filters"]
                await ctx.send("Chat filters: " + (", ".join(f"`{word}`" for word in filters) if filters else "none"))
            else:
                await ctx.send("Use `!chatfilter add <word>`, `!chatfilter remove <word>`, or `!chatfilter list`.")

        @self.bot.command(name="status")
        async def status(ctx):
            snapshot = self.get_snapshot()
            embed = self._base_embed("Monitoring status")
            embed.add_field(name="Status", value="Active", inline=True)
            embed.add_field(name="Tracked aircraft", value=str(len(snapshot)), inline=True)
            await ctx.send(embed=embed)

        @self.bot.command(name="belgium")
        async def belgium(ctx):
            snapshot = self.get_snapshot()
            inside = [item for item in snapshot.values() if item["inside"]]
            embed = self._base_embed("Aircraft currently inside Belgium")
            if not inside:
                embed.description = "No tracked aircraft are currently inside the monitoring zone."
            else:
                for item in inside[:25]:
                    embed.add_field(
                        name=f"{item['name']} (ID {item['aircraft_id']})",
                        value=self._position_text(item),
                        inline=False,
                    )
                if len(inside) > 25:
                    embed.set_footer(text=f"Showing 25 of {len(inside)} aircraft")
            await ctx.send(embed=embed)

        @self.bot.command(name="aircraft")
        async def aircraft(ctx, aircraft_id: str):
            item = self.get_aircraft(aircraft_id)
            if item is None:
                await ctx.send("No aircraft with that ID has been observed.")
                return
            embed = self._aircraft_embed("Latest position", aircraft_id, item)
            await ctx.send(embed=embed)

        @self.bot.command(name="stats")
        async def stats(ctx):
            values = self.get_stats()
            embed = self._base_embed("Monitoring statistics")
            embed.add_field(name="Aircraft seen today", value=str(values["seen_today"]), inline=True)
            embed.add_field(name="Entries", value=str(values["entries"]), inline=True)
            embed.add_field(name="Exits", value=str(values["exits"]), inline=True)
            embed.add_field(name="Currently inside zone", value=str(values["inside"]), inline=True)
            await ctx.send(embed=embed)

        @self.bot.command(name="help")
        async def help_command(ctx):
            embed = self._base_embed("Available commands")
            embed.description = (
                "`!status` - monitoring status and tracked count\n"
                "`!belgium` - aircraft currently inside Belgium\n"
                "`!aircraft <id>` - latest position for an aircraft\n"
                "`!stats` - daily entries, exits, and counts\n"
                "`!tag add/remove/list/clear/addbaf/removebaf` - manage scramble callsign tags\n"
                "`!scramble on/off/status` - control scramble monitoring\n"
                "`!chatlog on/off/status` - control GeoFS chat logging\n"
                "`!chatfilter add/remove/list` - manage chat keyword filters\n"
                "`!help` - show this command list"
            )
            await ctx.send(embed=embed)

    async def _send_startup_test(self, channel):
        if getattr(self, "startup_test_sent", False):
            return
        embed = self._base_embed("Startup notification")
        embed.description = "GeoFS Belgium Monitor is online."
        started = time.perf_counter()
        try:
            await channel.send(embed=embed)
            self.startup_test_sent = True
            logger.info(
                "Startup message sent: GeoFS Belgium Monitor is online. latency_ms=%.2f",
                (time.perf_counter() - started) * 1000,
            )
        except discord.Forbidden:
            logger.error("Bot lacks permission to send messages in channel %s", channel.id)
        except discord.HTTPException:
            logger.exception("Discord API returned an error while sending the test message")
        except discord.DiscordException:
            logger.exception("Discord error while sending the test message")

    @staticmethod
    def _base_embed(description):
        return discord.Embed(
            title="GeoFS Belgium Monitor",
            description=description,
            color=discord.Color.blue(),
            timestamp=datetime.now(timezone.utc),
        )

    def _aircraft_embed(self, event, aircraft_id, aircraft):
        embed = self._base_embed(event.title())
        embed.add_field(name="Callsign", value=str(aircraft.get("name", "unknown")), inline=True)
        embed.add_field(name="Aircraft Type", value=str(aircraft.get("aircraft_type", "unknown")), inline=True)
        nearest_base = aircraft.get("nearest_air_base", {})
        base_name = nearest_base.get("name", "unknown")
        base_distance = nearest_base.get("distance_km", "unknown")
        embed.add_field(name="Closest Belgian Air Base", value=f"{base_name} ({base_distance} km)", inline=False)
        base_links = self._base_links(nearest_base)
        embed.add_field(name="Get on at base", value=base_links, inline=False)
        embed.add_field(name="Latitude", value=str(aircraft.get("latitude", "unknown")), inline=True)
        embed.add_field(name="Longitude", value=str(aircraft.get("longitude", "unknown")), inline=True)
        embed.add_field(name="Altitude", value=f"{aircraft.get('altitude', 'unknown')} ft", inline=True)
        embed.add_field(name="Event Type", value=event, inline=True)
        embed.add_field(name="Aircraft ID", value=str(aircraft_id), inline=True)
        embed.add_field(name="Timestamp", value=str(aircraft.get("timestamp", "unknown")), inline=False)
        return embed

    @staticmethod
    def _position_text(aircraft):
        nearest_base = aircraft.get("nearest_air_base", {})
        return (
            f"Lat: {aircraft['latitude']} | Lon: {aircraft['longitude']}\n"
            f"Altitude: {aircraft['altitude']} ft | Type: {aircraft['aircraft_type']}\n"
            f"Closest base: {nearest_base.get('name', 'unknown')} ({nearest_base.get('distance_km', 'unknown')} km)\n"
            f"{DiscordBotService._base_links(nearest_base)}"
        )

    @staticmethod
    def _base_links(nearest_base):
        geofs_url = nearest_base.get("geofs_url")
        flyto_url = nearest_base.get("flyto_url")
        if not geofs_url or not flyto_url:
            return "Base links unavailable"
        return f"[Open in GeoFS]({geofs_url}) | [Fly to base]({flyto_url})"
