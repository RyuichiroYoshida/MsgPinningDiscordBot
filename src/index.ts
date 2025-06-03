import { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, ChatInputCommandInteraction, TextChannel } from "discord.js";
import * as dotenv from "dotenv";

// 環境変数を読み込み
dotenv.config();

const CLIENT_ID = process.env.CLIENT_ID!;
const GUILD_ID = process.env.GUILD_ID!; // 特定のサーバーのみの場合
const TOKEN = process.env.DISCORD_TOKEN!;

// スラッシュコマンドを定義
const commands = [
	new SlashCommandBuilder()
		.setName("pin")
		.setDescription("メッセージをピン留めします")
		.addStringOption((option) => option.setName("message_link").setDescription("ピン留めするメッセージのリンク（省略時は直前のメッセージ）").setRequired(false)),

	new SlashCommandBuilder()
		.setName("unpin")
		.setDescription("メッセージのピン留めを解除します")
		.addStringOption((option) => option.setName("message_link").setDescription("ピン留めを解除するメッセージのリンク（省略時は直前のメッセージ）").setRequired(false)),
];

// REST APIクライアントを作成
const rest = new REST({ version: "10" }).setToken(TOKEN);
async function logCommandExecution(interaction: ChatInputCommandInteraction) {
	// コマンドを実行したユーザー情報を取得
	const user = interaction.user;
	// 実行されたコマンド名を取得
	const command = interaction.commandName;
	// コマンドが実行されたチャンネルIDを取得（DMの場合は"DM"と表示）
	const channel = interaction.channel?.id ?? "DM";
	// コマンドが実行されたサーバー（ギルド）IDを取得（DMの場合は"DM"と表示）
	const guild = interaction.guild?.id ?? "DM";
	const logMessage = `[COMMAND LOG] User: ${user.tag} (${user.id}), Command: /${command}, Guild: ${guild}, Channel: ${channel}`;

	// ログとしてコマンド実行情報を出力
	console.log(logMessage);

	// ギルド内のログチャンネルに送信
	if (interaction.guild) {
		const logChannel = interaction.guild.channels.cache.find((c) => c.name === "bot-logs" && c.isTextBased());
		if (logChannel && logChannel.isTextBased()) {
			try {
				await logChannel.send(logMessage);
			} catch (e) {
				console.error("ログチャンネルへの送信に失敗:", e);
			}
		}
	} else {
		console.log("DMでのコマンド実行はログチャンネルに送信されません。");
	}
}
// スラッシュコマンドを登録する関数
async function registerCommands() {
	try {
		console.log("スラッシュコマンドを登録中...");

		// グローバルコマンドとして登録（全サーバーで利用可能、反映に時間がかかる）
		await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

		// または特定のサーバーのみに登録する場合（即座に反映される）
		// await rest.put(
		//   Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
		//   { body: commands }
		// );

		console.log("スラッシュコマンドの登録が完了しました！");
	} catch (error) {
		console.error("スラッシュコマンドの登録に失敗しました:", error);
	}
}

// Discord BOTクライアントを作成
const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// BOTの準備が完了したときの処理
client.once("ready", async () => {
	console.log(`${client.user?.tag} としてログインしました！`);

	// スラッシュコマンドを登録
	await registerCommands();
});

// スラッシュコマンドが実行されたときの処理
client.on("interactionCreate", async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	const { commandName } = interaction;

	if (commandName === "pin") {
		await handlePinCommand(interaction);
	} else if (commandName === "unpin") {
		await handleUnpinCommand(interaction);
	}
});

// メッセージリンクを解析する関数
function parseMessageLink(messageLink: string): { guildId: string; channelId: string; messageId: string } | null {
	// Discord メッセージリンクの形式: https://discord.com/channels/GUILD_ID/CHANNEL_ID/MESSAGE_ID
	const linkRegex = /https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
	const match = messageLink.match(linkRegex);

	if (!match) {
		return null;
	}

	return {
		guildId: match[1],
		channelId: match[2],
		messageId: match[3],
	};
}

// 指定されたメッセージを取得する関数
async function getMessageFromLink(client: Client, messageLink: string) {
	const parsedLink = parseMessageLink(messageLink);

	if (!parsedLink) {
		throw new Error("無効なメッセージリンクです。正しい形式: https://discord.com/channels/SERVER_ID/CHANNEL_ID/MESSAGE_ID");
	}

	try {
		const guild = await client.guilds.fetch(parsedLink.guildId);
		const channel = await guild.channels.fetch(parsedLink.channelId);

		if (!(channel instanceof TextChannel)) {
			throw new Error("指定されたチャンネルはテキストチャンネルではありません。");
		}

		const message = await channel.messages.fetch(parsedLink.messageId);
		return message;
	} catch (error) {
		if (error instanceof Error && error.message.includes("Unknown")) {
			throw new Error("メッセージが見つかりません。リンクが正しいか、BOTがそのサーバー・チャンネルにアクセスできるか確認してください。");
		}
		throw error;
	}
}
async function handlePinCommand(interaction: ChatInputCommandInteraction) {
	try {
		// チャンネルがテキストチャンネルかどうか確認
		if (!(interaction.channel instanceof TextChannel)) {
			await interaction.reply({
				content: "このコマンドはテキストチャンネルでのみ使用できます。",
				ephemeral: true,
			});
			return;
		}

		// 直前のメッセージを取得
		const messages = await interaction.channel.messages.fetch({
			limit: 1,
			before: interaction.id,
		});

		const previousMessage = messages.first();

		if (!previousMessage) {
			await interaction.reply({
				content: "ピン留めするメッセージが見つかりません。",
				ephemeral: true,
			});
			return;
		}

		// BOTのメッセージはピン留めしない
		if (previousMessage.author.bot) {
			await interaction.reply({
				content: "BOTのメッセージはピン留めできません。",
				ephemeral: true,
			});
			return;
		}

		// 既にピン留めされているかチェック
		if (previousMessage.pinned) {
			await interaction.reply({
				content: "そのメッセージは既にピン留めされています。",
				ephemeral: true,
			});
			return;
		}

		// メッセージをピン留め
		await previousMessage.pin();

		// 成功メッセージを送信
		await interaction.reply({
			content: `✅ メッセージをピン留めしました！\n> ${previousMessage.content.substring(0, 50)}${previousMessage.content.length > 50 ? "..." : ""}`,
			ephemeral: true,
		});
	} catch (error) {
		console.error("ピン留めエラー:", error);

		let errorMessage = "❌ ピン留めに失敗しました。";

		if (error instanceof Error) {
			if (error.message.includes("Missing Permissions")) {
				errorMessage = "❌ ピン留めする権限がありません。";
			} else if (error.message.includes("Maximum number of pins")) {
				errorMessage = "❌ このチャンネルのピン留め数が上限に達しています。";
			}
		}

		await interaction.reply({
			content: errorMessage,
			ephemeral: true,
		});
	} finally {
		// コマンドメッセージの取得
		logCommandExecution(interaction);
	}
}

// アンピンコマンドの処理
async function handleUnpinCommand(interaction: ChatInputCommandInteraction) {
	try {
		const messageLink = interaction.options.getString("message_link");
		let targetMessage;

		if (messageLink) {
			// メッセージリンクが指定された場合
			try {
				targetMessage = await getMessageFromLink(interaction.client, messageLink);
			} catch (error) {
				await interaction.reply({
					content: error instanceof Error ? error.message : "❌ メッセージの取得に失敗しました。",
					ephemeral: true,
				});
				return;
			}
		} else {
			// メッセージリンクが指定されていない場合（従来の動作）
			if (!(interaction.channel instanceof TextChannel)) {
				await interaction.reply({
					content: "このコマンドはテキストチャンネルでのみ使用できます。",
					ephemeral: true,
				});
				return;
			}

			const messages = await interaction.channel.messages.fetch({
				limit: 1,
				before: interaction.id,
			});

			targetMessage = messages.first();

			if (!targetMessage) {
				await interaction.reply({
					content: "アンピンするメッセージが見つかりません。",
					ephemeral: true,
				});
				return;
			}
		}

		if (!targetMessage.pinned) {
			await interaction.reply({
				content: "そのメッセージはピン留めされていません。",
				ephemeral: true,
			});
			return;
		}

		// ピン留めを解除
		await targetMessage.unpin();

		const messagePreview = targetMessage.content.substring(0, 50);
		const truncated = targetMessage.content.length > 50 ? "..." : "";
		const channelMention = `<#${targetMessage.channel.id}>`;

		await interaction.reply({
			content: `📌 ピン留めを解除しました！\n📍 チャンネル: ${channelMention}\n💬 内容: ${messagePreview}${truncated}`,
			ephemeral: true,
		});
	} catch (error) {
		console.error("アンピンエラー:", error);
		await interaction.reply({
			content: "❌ ピン留めの解除に失敗しました。",
			ephemeral: true,
		});
	} finally {
		// コマンドメッセージの取得
		logCommandExecution(interaction);
	}
}

// 通常のメッセージ処理（!pin コマンドも残す）
client.on("messageCreate", async (message) => {
	if (message.author.bot) return;

	// テキストコマンドも残しておく
	if (message.content === "!pin") {
		try {
			if (!(message.channel instanceof TextChannel)) {
				await message.reply("このコマンドはテキストチャンネルでのみ使用できます。");
				return;
			}

			const messages = await message.channel.messages.fetch({
				limit: 2,
				before: message.id,
			});

			const previousMessage = messages.first();

			if (!previousMessage) {
				await message.reply("ピン留めするメッセージが見つかりません。");
				return;
			}

			if (previousMessage.author.bot) {
				await message.reply("BOTのメッセージはピン留めできません。");
				return;
			}

			if (previousMessage.pinned) {
				await message.reply("そのメッセージは既にピン留めされています。");
				return;
			}

			await previousMessage.pin();
			await message.reply(`✅ メッセージをピン留めしました！`);

			// コマンドメッセージを削除
			setTimeout(async () => {
				try {
					await message.delete();
				} catch (error) {
					console.log("コマンドメッセージの削除に失敗しました:", error);
				}
			}, 3000);
		} catch (error) {
			console.error("ピン留めエラー:", error);
			await message.reply("❌ ピン留めに失敗しました。");
		}
	}
});

// BOTにログイン
client.login(TOKEN);

// プロセス終了時の処理
process.on("SIGINT", () => {
	console.log("BOTをシャットダウンしています...");
	client.destroy();
	process.exit(0);
});
