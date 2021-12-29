require("dotenv").config();

import discord, {
  Message,
  MessageReaction,
  User,
  Intents,
  PartialMessageReaction,
  PartialUser,
} from "discord.js";

import { logger, stdoutLog, channelLog } from "./features/log";
// import codeblock from './features/codeblock';
import jobs from "./features/jobs";
import autoban from "./features/autoban";
import commands from "./features/commands";
import setupStats from "./features/stats";
import emojiMod from "./features/emojiMod";
import autodelete from "./features/autodelete-spam";
import { ChannelHandlers } from "./types";
import {
  MESSAGE_SCHEDULE,
  scheduleMessages,
} from "./features/scheduled-messages";
import tsPlaygroundLinkShortener from "./features/tsplay";

export const bot = new discord.Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    Intents.FLAGS.DIRECT_MESSAGES,
    Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
  ],
  partials: ["MESSAGE", "CHANNEL", "REACTION"],
});

bot
  .login(process.env.DISCORD_HASH)
  .then(async () => {
    logger.log("INI", "Bootstrap complete");

    bot.user?.setActivity("DMs for !commands", { type: "WATCHING" });

    scheduleMessages(bot, MESSAGE_SCHEDULE);

    try {
      const guilds = await bot.guilds.fetch();
      guilds.each((guild) =>
        logger.log("INI", `Bot connected to Discord server: ${guild.name}`),
      );
    } catch (error) {
      console.log("Something went wrong when fetching the guilds: ", error);
    }

    if (bot.application) {
      const { id } = bot.application;
      console.log("Bot started. If necessary, add it to your test server:");
      console.log(
        `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot`,
      );
    }
  })
  .catch((e) => {
    console.log({ e });
    console.log(
      `Failed to log into discord bot. Make sure \`.env.local\` has a discord token. Tried to use '${process.env.DISCORD_HASH}'`,
    );
    console.log(
      'You can get a new discord token at https://discord.com/developers/applications, selecting your bot (or making a new one), navigating to "Bot", and clicking "Copy" under "Click to reveal token"',
    );
    process.exit(1);
  });

export type ChannelHandlersById = {
  [channelId: string]: ChannelHandlers[];
};

const channelHandlersById: ChannelHandlersById = {};

const addHandler = (channelId: string, channelHandlers: ChannelHandlers) => {
  channelHandlersById[channelId] = [
    ...(channelHandlersById[channelId] || []),
    channelHandlers,
  ];
};

const handleMessage = async (message: Message) => {
  const msg = message.partial ? await message.fetch() : message;

  const channelId = msg.channel.id;

  if (channelHandlersById[channelId]) {
    channelHandlersById[channelId].forEach((channelHandlers) => {
      channelHandlers.handleMessage?.({ msg, bot });
    });
  }

  if (channelHandlersById["*"]) {
    channelHandlersById["*"].forEach((channelHandlers) => {
      channelHandlers.handleMessage?.({ msg, bot });
    });
  }
};

const handleReaction = (
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
) => {
  const channelId = reaction.message.channel.id;
  const handlers = channelHandlersById[channelId];

  if (handlers) {
    handlers.forEach((channelHandlers) => {
      channelHandlers.handleReaction?.({ reaction, user, bot });
    });
  }

  channelHandlersById["*"].forEach((channelHandlers) => {
    channelHandlers.handleReaction?.({ reaction, user, bot });
  });
};

logger.add(stdoutLog);
if (process.env.BOT_LOG) {
  logger.add(channelLog(bot, process.env.BOT_LOG)); // #bot-log
}

// Amplitude metrics
setupStats(bot);

// reactiflux
addHandler("103882387330457600", jobs);

// common
addHandler("*", commands);
// addHandler('*', codeblock);
addHandler("*", autoban);
addHandler("*", emojiMod);
addHandler("*", autodelete);
addHandler("*", tsPlaygroundLinkShortener);

bot.on("messageReactionAdd", handleReaction);

bot.on("messageCreate", async (msg) => {
  if (msg.author?.id === bot.user?.id) return;

  handleMessage(msg);
});

bot.on("error", (err) => {
  try {
    logger.log("ERR", err.message);
  } catch (e) {
    logger.log("ERR", err + "");
  }
});

const errorHandler = (error: unknown) => {
  if (error instanceof Error) {
    logger.log("ERROR", error.message);
  } else if (typeof error === "string") {
    logger.log("ERROR", error);
  }
};

process.on("uncaughtException", errorHandler);
process.on("unhandledRejection", errorHandler);
