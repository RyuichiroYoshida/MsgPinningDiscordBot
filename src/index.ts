import { Client, GatewayIntentBits, Message, TextChannel } from "discord.js";
import * as dotenv from "dotenv";

// 環境変数を読み込み
dotenv.config();

// Discord BOTクライアントを作成
const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// BOTの準備が完了したときの処理
client.once("ready", () => {
	console.log(`${client.user?.tag} としてログインしました！`);
});

// メッセージが送信されたときの処理
client.on("messageCreate", async (message: Message) => {
	// BOT自身のメッセージは無視
	if (message.author.bot) return;

	// コマンドをチェック（!pin または /pin）
	if (message.content === "!pin" || message.content === "/pin") {
		try {
			// チャンネルがテキストチャンネルかどうか確認
			if (!(message.channel instanceof TextChannel)) {
				await message.reply("このコマンドはテキストチャンネルでのみ使用できます。");
				return;
			}

			// 直前のメッセージを取得
			const messages = await message.channel.messages.fetch({
				limit: 2, // コマンドメッセージと直前のメッセージ
				before: message.id,
			});

			// 直前のメッセージを取得
			const previousMessage = messages.first();

			if (!previousMessage) {
				await message.reply("ピン留めするメッセージが見つかりません。");
				return;
			}

			// BOTのメッセージはピン留めしない
			if (previousMessage.author.bot) {
				await message.reply("BOTのメッセージはピン留めできません。");
				return;
			}

			// 既にピン留めされているかチェック
			if (previousMessage.pinned) {
				await message.reply("そのメッセージは既にピン留めされています。");
				return;
			}

			// メッセージをピン留め
			await previousMessage.pin();

			// 成功メッセージを送信
			await message.reply(`✅ メッセージをピン留めしました！\n> ${previousMessage.content.substring(0, 50)}${previousMessage.content.length > 50 ? "..." : ""}`);

			// コマンドメッセージを削除（オプション）
			setTimeout(async () => {
				try {
					await message.delete();
				} catch (error) {
					console.log("コマンドメッセージの削除に失敗しました:", error);
				}
			}, 3000);
		} catch (error) {
			console.error("ピン留めエラー:", error);

			// エラーの種類に応じてメッセージを変更
			if (error instanceof Error) {
				if (error.message.includes("Missing Permissions")) {
					await message.reply("❌ ピン留めする権限がありません。");
				} else if (error.message.includes("Maximum number of pins")) {
					await message.reply("❌ このチャンネルのピン留め数が上限に達しています。");
				} else {
					await message.reply("❌ ピン留めに失敗しました。");
				}
			} else {
				await message.reply("❌ 予期しないエラーが発生しました。");
			}
		}
	}

	// アンピンコマンド（おまけ機能）
	if (message.content === "!unpin" || message.content === "/unpin") {
		try {
			if (!(message.channel instanceof TextChannel)) {
				await message.reply("このコマンドはテキストチャンネルでのみ使用できます。");
				return;
			}

			// 直前のメッセージを取得
			const messages = await message.channel.messages.fetch({
				limit: 2,
				before: message.id,
			});

			const previousMessage = messages.first();

			if (!previousMessage) {
				await message.reply("アンピンするメッセージが見つかりません。");
				return;
			}

			if (!previousMessage.pinned) {
				await message.reply("そのメッセージはピン留めされていません。");
				return;
			}

			// ピン留めを解除
			await previousMessage.unpin();
			await message.reply("📌 ピン留めを解除しました！");

			// コマンドメッセージを削除
			setTimeout(async () => {
				try {
					await message.delete();
				} catch (error) {
					console.log("コマンドメッセージの削除に失敗しました:", error);
				}
			}, 3000);
		} catch (error) {
			console.error("アンピンエラー:", error);
			await message.reply("❌ ピン留めの解除に失敗しました。");
		}
	}
});

// BOTにログイン
client.login(process.env.DISCORD_TOKEN);

// プロセス終了時の処理
process.on("SIGINT", () => {
	console.log("BOTをシャットダウンしています...");
	client.destroy();
	process.exit(0);
});
