// Import necessary modules
import { Telegraf } from "telegraf"
import { Job, scheduleJob } from "node-schedule"
import dotenv from "dotenv"
import TelegramUserService from "./database"

dotenv.config()

// Replace "YOUR_TOKEN_HERE" with your bot"s token
const BOT_TOKEN = process.env.BOT_TOKEN as string
const OWNER_ID = Number(process.env.OWNER_ID) as number
if (!BOT_TOKEN || !OWNER_ID) {
    throw new Error("BOT_TOKEN/OWNER_ID must be provided!")
}

const userService = new TelegramUserService()

// Initialize the bot
const bot = new Telegraf(BOT_TOKEN)

// Store scheduled jobs
const scheduledJobs: Map<string, { job: Job; message: string; date: Date }> = new Map();

// Log bot activity
const log = (message: string) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
};

// Handle /start command
bot.start(async (ctx) => {
    const userId = ctx.from?.id
    if (userId) {
        const user = await userService.findUserByTelegramId({ telegramId: userId })
        if (user) {
            return ctx.reply("You are already subscribed to broadcast messages.")
        } else {
            await userService.createUser({
                user: {
                    telegramId: userId,
                    firstName: ctx.from?.first_name,
                    lastName: ctx.from?.last_name || "",
                    joinedDate: new Date().toISOString(),
                    isSubscribed: true
                }
            })
            log(`User ${userId} subscribed.`)
            return ctx.reply(`Welcome ${ctx.from?.first_name || "User"}! You are now subscribed to broadcast messages.`)
        }
    }
})

// Command for the owner to broadcast messages
bot.command("broadcast", async (ctx) => {
    if (ctx.from?.id !== OWNER_ID) {
        log(`Unauthorized broadcast attempt by user ${ctx.from?.id}`);
        return ctx.reply("You are not authorized to use this command.")
    }

    const message = ctx.message.text?.split(" ").slice(1).join(" ")
    if (!message) {
        return ctx.reply("Please provide a message to broadcast. Usage: /broadcast Your message here.")
    }

    const allUser = await userService.getAllUsers()

    allUser.forEach((user) => {
        bot.telegram.sendMessage(user.telegramId, message).catch((err) => {
            console.error(`Failed to send message to ${user.telegramId}:`, err)
        })
    })

    ctx.reply("Broadcast message sent to all subscribers.")
    log(`Broadcast message sent by owner: ${message}`);
})

bot.command("schedule", async (ctx) => {
    if (ctx.from?.id !== OWNER_ID) {
        log(`Unauthorized schedule attempt by user ${ctx.from?.id}`);
        return ctx.reply("You are not authorized to use this command.");
    }

    const args = ctx.message.text?.split(" ").slice(1);
    if (!args || args.length < 2) {
        return ctx.reply(
            "Invalid format. Usage for text: /schedule dd/MM/yyyy HH:mm message\n" +
            "Usage for media: /schedule media dd/MM/yyyy HH:mm Optional Caption (reply to a media message)."
        );
    }

    const [firstArg, dateStr, timeStr, ...messageParts] = args;

    // Check if it"s a media scheduling request
    const isMedia = firstArg === "media";

    // Handle date and time parsing
    const dateTimeStr = isMedia ? `${dateStr} ${timeStr}` : `${firstArg} ${dateStr}`;
    const scheduleDate = new Date(
        dateTimeStr.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1") // Convert dd/MM/yyyy to yyyy-MM-dd
    );

    if (isNaN(scheduleDate.getTime())) {
        return ctx.reply("Invalid date or time format. Ensure the format is dd/MM/yyyy HH:mm.");
    }

    // Prevent scheduling for past dates
    const now = new Date();
    if (scheduleDate <= now) {
        return ctx.reply("Cannot schedule a message in the past. Please select a future date and time.");
    }

    if (isMedia) {
        // Handle media scheduling
        const replyToMessage = ctx.message.reply_to_message;
        if (!replyToMessage) {
            return ctx.reply("Please reply to a media message (photo, video, document, etc.) to schedule it.");
        }

        // Extract media details
        let mediaType: "photo" | "video" | "document" | undefined;
        let mediaFileId: string | undefined;

        if ("photo" in replyToMessage && replyToMessage.photo) {
            mediaType = "photo";
            mediaFileId = replyToMessage.photo[replyToMessage.photo.length - 1].file_id;
        } else if ("video" in replyToMessage && replyToMessage.video) {
            mediaType = "video";
            mediaFileId = replyToMessage.video.file_id;
        } else if ("document" in replyToMessage && replyToMessage.document) {
            mediaType = "document";
            mediaFileId = replyToMessage.document.file_id;
        }

        if (!mediaType || !mediaFileId) {
            return ctx.reply("The replied message must contain valid media (photo, video, or document).");
        }

        // Schedule the media message
        const caption = messageParts.join(" ") || ""; // Optional caption
        const jobId = `${Date.now()}`;
        const job = scheduleJob(scheduleDate, async () => {
            try {
                const allUsers = await userService.getAllUsers()
                if (!allUsers) {
                    return log("No subscribers to broadcast the scheduled message.");
                }

                for (const user of allUsers) {
                    const userId = user.telegramId;
                    if (user.isSubscribed) {
                        await bot.telegram
                            .sendMessage(userId, "Scheduled media broadcast:")
                            .catch((err) => console.error(`Failed to send caption to ${userId}:`, err));

                        if (mediaType === "photo") {
                            await bot.telegram
                                .sendPhoto(userId, mediaFileId, { caption })
                                .catch((err) => console.error(`Failed to send photo to ${userId}:`, err));
                        } else if (mediaType === "video") {
                            await bot.telegram
                                .sendVideo(userId, mediaFileId, { caption })
                                .catch((err) => console.error(`Failed to send video to ${userId}:`, err));
                        } else if (mediaType === "document") {
                            await bot.telegram
                                .sendDocument(userId, mediaFileId, { caption })
                                .catch((err) => console.error(`Failed to send document to ${userId}:`, err));
                        }
                    }
                }

                log(`Scheduled media message sent: Media Type - ${mediaType}, Caption - ${caption}`);
            } catch (err) {
                console.error("Error during scheduled media broadcast:", err);
            } finally {
                scheduledJobs.delete(jobId); // Clean up
            }
        });

        scheduledJobs.set(jobId, { job, message: `Media: ${mediaType}, Caption: ${caption}`, date: scheduleDate });
        ctx.reply(`Media message scheduled successfully for ${dateTimeStr} with ID: ${jobId}.`);
        log(`Media message scheduled by owner for ${dateTimeStr}: Media Type - ${mediaType}, Caption - ${caption}`);
    } else {
        // Handle text message scheduling
        const textMessage = messageParts.join(" ");
        if (!textMessage) {
            return ctx.reply("Text message content cannot be empty.");
        }

        const jobId = `${Date.now()}`;
        const job = scheduleJob(scheduleDate, async () => {
            try {
                const allUsers = await userService.getAllUsers()
                if (!allUsers) {
                    return log("No subscribers to broadcast the scheduled message.");
                }

                for (const user of allUsers) {
                    const userId = user.telegramId
                    if (user.isSubscribed) {
                        await bot.telegram
                            .sendMessage(userId, `Scheduled message: ${textMessage}`)
                            .catch((err) => console.error(`Failed to send text message to ${userId}:`, err));
                    }
                }

                log(`Scheduled text message sent: ${textMessage}`);
            } catch (err) {
                console.error("Error during scheduled text broadcast:", err);
            } finally {
                scheduledJobs.delete(jobId); // Clean up
            }
        });

        scheduledJobs.set(jobId, { job, message: textMessage, date: scheduleDate });
        ctx.reply(`Text message scheduled successfully for ${dateTimeStr} with ID: ${jobId}.`);
        log(`Text message scheduled by owner for ${dateTimeStr}: ${textMessage}`);
    }
});

// Command to list all scheduled messages
bot.command("list_schedules", (ctx) => {
    if (ctx.from?.id !== OWNER_ID) {
        log(`Unauthorized list_schedules attempt by user ${ctx.from?.id}`);
        return ctx.reply("You are not authorized to use this command.");
    }

    if (scheduledJobs.size === 0) {
        return ctx.reply("No messages are currently scheduled.");
    }

    const schedules = Array.from(scheduledJobs.entries())
        .map(([id, { message, date }]) => `ID: ${id}\nDate: ${date.toISOString()}\nMessage: ${message}`)
        .join("\n\n");

    ctx.reply(`Scheduled Messages:\n\n${schedules}`);
    log("Listed all scheduled messages.");
});

// Command to cancel a scheduled message
bot.command("cancel_schedule", (ctx) => {
    if (ctx.from?.id !== OWNER_ID) {
        log(`Unauthorized cancel_schedule attempt by user ${ctx.from?.id}`);
        return ctx.reply("You are not authorized to use this command.");
    }

    const args = ctx.message.text?.split(" ").slice(1);
    if (!args || args.length !== 1) {
        return ctx.reply("Invalid format. Usage: /cancel_schedule schedule_id.");
    }

    const [jobId] = args;
    const schedule = scheduledJobs.get(jobId);

    if (!schedule) {
        return ctx.reply(`No schedule found with ID: ${jobId}`);
    }

    schedule.job.cancel();
    scheduledJobs.delete(jobId);

    ctx.reply(`Schedule with ID: ${jobId} has been canceled.`);
    log(`Schedule with ID: ${jobId} canceled.`);
});

bot.command("stop", async (ctx) => {
    log(`Bot stopped by user ${ctx.from?.id}`)
    await userService.updateUser({ telegramId: ctx.from?.id as number, updateData: { isSubscribed: false } })
    return ctx.reply("You have unsubscribed to the broadcast messages.")
});

// Graceful shutdown
bot.catch((err) => {
    console.error("Error occurred:", err)
})

bot.launch(async () => {
    await userService.initialize()
    log("Broadcast bot started successfully")
})
    .then(() => log("Broadcast bot stopped successfully"))
    .catch((err) => console.error("Failed to start the bot:", err))

process.once("SIGINT", () => bot.stop("SIGINT"))
process.once("SIGTERM", () => bot.stop("SIGTERM"))
