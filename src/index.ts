import { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, ChatInputCommandInteraction, TextChannel } from "discord.js";
import * as dotenv from "dotenv";

// 環境変数を読み込み
dotenv.config();

const CLIENT_ID = process.env.CLIENT_ID!;
const GUILD_ID = process.env.GUILD_ID!; // 特定のサーバーのみの場合
const TOKEN = process.env.DISCORD_TOKEN!;

// スラッシュコマンドを定義
const commands = [
	new SlashCommandBuilder().setName("pin").setDescription("直前のメッセージをピン留めします"),

	new SlashCommandBuilder().setName("unpin").setDescription("直前のメッセージのピン留めを解除します"),
];

// REST APIクライアントを作成
const rest = new REST({ version: "10" }).setToken(TOKEN);

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

// ピン留めコマンドの処理
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
	}
}

// アンピンコマンドの処理
async function handleUnpinCommand(interaction: ChatInputCommandInteraction) {
	try {
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
				content: "アンピンするメッセージが見つかりません。",
				ephemeral: true,
			});
			return;
		}

		if (!previousMessage.pinned) {
			await interaction.reply({
				content: "そのメッセージはピン留めされていません。",
				ephemeral: true,
			});
			return;
		}

		// ピン留めを解除
		await previousMessage.unpin();

		await interaction.reply({
			content: "📌 ピン留めを解除しました！",
			ephemeral: true,
		});
	} catch (error) {
		console.error("アンピンエラー:", error);
		await interaction.reply({
			content: "❌ ピン留めの解除に失敗しました。",
			ephemeral: true,
		});
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
