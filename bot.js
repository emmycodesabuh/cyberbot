const fs = require("fs");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const schedule = require("node-schedule");
const qrcode = require("qrcode-terminal");

const questions = require("./questions.json");
const tips = require("./tips.json");
let scores = require("./scores.json");

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });

  const send = (jid, text) => sock.sendMessage(jid, { text });

  // Show QR in terminal
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("Scan this QR code to login:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ Bot is connected as", sock.user.id);
      // Set the status once connected
      sock.setStatus('I am your CyberSec Bot! Type "help" for commands.');
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("❌ Disconnected. Reconnecting:", shouldReconnect);
      if (shouldReconnect) {
        startBot();
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // Send daily tip at 9AM
  schedule.scheduleJob("0 9 * * *", async () => {
    const tip = tips[Math.floor(Math.random() * tips.length)];
    for (let jid in scores) {
      await send(jid, `🛡️ Daily Cyber Tip:\n${tip}`);
    }
  });

  // Handle messages
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
    const now = Date.now();

    // Anti-spam: block forwarded messages
    if (msg.message?.extendedTextMessage?.contextInfo?.isForwarded) {
      return await send(jid, "⚠️ Forwarded messages are not allowed.");
    }

    const user = scores[jid] || { score: 0, currentQ: null, lastMsgTime: 0 };
    if (now - user.lastMsgTime < 3000) {
      return send(jid, "⏳ Please wait before sending another command.");
    }
    user.lastMsgTime = now;

    const saveScores = () => {
      scores[jid] = user;
      fs.writeFileSync("./scores.json", JSON.stringify(scores, null, 2));
    };

    // First contact - send a welcome message
    if (["hi", "hello"].includes(text.toLowerCase())) {
      return await send(jid, `🤖 Welcome to CyberSec Bot! Here's what I can do:\n\n- "quiz" for a question\n- "tip" for a cyber tip\n- "score" to view your score\n- "help" for help!`);
    }

    // Custom Help Command
    if (text.toLowerCase() === "help") {
      return await send(jid, `📝 Help Command: Here's what I can do:\n\n- "quiz" for a question\n- "tip" for a cyber tip\n- "score" to view your score\n- "broadcast <message>" for admin broadcasts`);
    }

    if (text.toLowerCase() === "tip") {
      const tip = tips[Math.floor(Math.random() * tips.length)];
      return await send(jid, `💡 Cyber Tip: ${tip}`);
    }

    if (text.toLowerCase() === "quiz") {
      const q = questions[Math.floor(Math.random() * questions.length)];
      user.currentQ = q;
      const options = ["A", "B", "C", "D"].map((opt, i) => `${opt}) ${q.options[i]}`).join("\n");
      await send(jid, `🧠 Cyber Quiz:\n${q.question}\n\n${options}\n\nReply with A, B, C, or D`);
      saveScores();
      return;
    }

    if (["a", "b", "c", "d"].includes(text.toLowerCase())) {
      if (!user.currentQ) return send(jid, "Please start with 'quiz' first.");
      const correct = user.currentQ.answer.toLowerCase();
      if (text.toLowerCase() === correct) {
        user.score++;
        await send(jid, `✅ Correct! Your score: ${user.score}`);
      } else {
        await send(jid, `❌ Wrong. The correct answer was ${user.currentQ.answer}. Score: ${user.score}`);
      }
      user.currentQ = null;
      saveScores();
      return;
    }

    if (text.toLowerCase() === "score") {
      return await send(jid, `🏆 Your score: ${user.score}`);
    }

    // Admin broadcast command (only available to a specific number)
    if (jid === "2349022603337@s.whatsapp.net" && text.startsWith("broadcast ")) {
      const msg = text.replace("broadcast ", "");
      for (let id in scores) await send(id, `📢 Broadcast from Admin:\n${msg}`);
    }

    // File handling: Send media or files (Admin-only)
    if (jid === "2349022603337@s.whatsapp.net" && text.startsWith("sendfile ")) {
      const filePath = text.replace("sendfile ", "");
      if (fs.existsSync(filePath)) {
        await sock.sendMessage(jid, { 
          document: fs.readFileSync(filePath), 
          mimetype: 'application/pdf', 
          fileName: 'Document.pdf' 
        });
      } else {
        await send(jid, "❌ File not found!");
      }
    }

    saveScores();
  });

  // Optional: Set bot DP once connected
  const setProfilePic = async (imagePath) => {
    const checkAndSet = setInterval(async () => {
      if (sock.user?.id) {
        clearInterval(checkAndSet);
        try {
          await sock.updateProfilePicture(sock.user.id, { url: imagePath });
          console.log("✅ Bot profile picture updated!");
        } catch (err) {
          console.log("⚠️ Failed to update DP:", err.message);
        }
      }
    }, 1000);
  };

  // Uncomment to set the profile picture
  // await setProfilePic('./dp-image.jpg');
}

startBot();
