const fs = require("fs");
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const schedule = require("node-schedule");

const questions = require("./questions.json");
const tips = require("./tips.json");
let scores = require("./scores.json");
let phoneNumber = '2349022603337';

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const sock = makeWASocket({ auth: state });

  const send = (jid, text) => sock.sendMessage(jid, { text });

  schedule.scheduleJob("0 9 * * *", async () => {
    const tip = tips[Math.floor(Math.random() * tips.length)];
    for (let jid in scores) {
      await send(jid, `Daily Cyber Tip:
${tip}`);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
    const now = Date.now();

    const user = scores[jid] || { score: 0, currentQ: null, lastMsgTime: 0 };

    if (now - user.lastMsgTime < 3000) {
      return send(jid, "Please wait a bit before sending another command.");
    }
    user.lastMsgTime = now;

    const saveScores = () => {
      scores[jid] = user;
      fs.writeFileSync("./scores.json", JSON.stringify(scores, null, 2));
    };

    if (text.toLowerCase() === "hi" || text.toLowerCase() === "hello") {
      await send(jid, `Welcome to CyberSec Bot!
Type:
- "quiz" for a question
- "tip" for a tip
- "score" to view your score`);
    }

    if (text.toLowerCase() === "tip") {
      const tip = tips[Math.floor(Math.random() * tips.length)];
      await send(jid, `Cyber Tip: ${tip}`);
    }

    if (text.toLowerCase() === "quiz") {
      const q = questions[Math.floor(Math.random() * questions.length)];
      user.currentQ = q;
      const options = ["A", "B", "C", "D"].map((opt, i) => `${opt}) ${q.options[i]}`).join("\n");
      await send(jid, `Cyber Quiz:\n${q.question}\n\n${options}\n\nReply with A, B, C, or D`);
      saveScores();
    }

    if (["a", "b", "c", "d"].includes(text.toLowerCase())) {
      if (!user.currentQ) return send(jid, "Please type 'quiz' to get a question first.");
      const correct = user.currentQ.answer.toLowerCase();
      if (text.toLowerCase() === correct) {
        user.score++;
        await send(jid, `Correct! Your score is now ${user.score}`);
      } else {
        await send(jid, `Incorrect. The right answer was ${user.currentQ.answer}. Your score is ${user.score}`);
      }
      user.currentQ = null;
      saveScores();
    }

    if (text.toLowerCase() === "score") {
      await send(jid, `Your score is: ${user.score}`);
    }

    if (jid === `${phoneNumber}@s.whatsapp.net` && text.startsWith("broadcast ")) {
      const msg = text.replace("broadcast ", "");
      for (let id in scores) await send(id, `Broadcast from Admin:\n${msg}`);
    }

    saveScores();
  });

  sock.ev.on("creds.update", saveCreds);

  // Optional: Set bot profile picture (run once)
  
  const setProfilePic = async (imagePath) => {
    // wait unti sock is connected and user ID is available
    const checkAndSet = setInterval(async () => {
      if(sock.user?.id) {
        clearInterval(checkAndSet);
        try {
          await sock.updateProfilePicture(sock.user.id, {url: imagePath});
          console.log("Bot DP updated!");
        } catch (err) {
          console.log("Error updating DP: ", err.message);
        }
      }
    }, 1000);
  };
  await setProfilePic('./bot-dp.jpg');
}

startBot();
