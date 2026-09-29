export default async function handler(req, res) {
  // Meta webhook verification
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (
      mode === "subscribe" &&
      token === process.env.META_VERIFY_TOKEN
    ) {
      return res.status(200).send(challenge);
    }

    return res.status(403).send("Forbidden");
  }

  // Messenger events
  if (req.method === "POST") {
    const body = req.body;

    if (body.object !== "page") {
      return res.status(404).send("Not a page event");
    }

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id;

        if (!senderId) continue;

        // =========================
        // TEXT MESSAGE
        // =========================
        if (event.message?.text) {
          const message = event.message.text.trim().toLowerCase();

          console.log("Messenger:", senderId, message);

          // Canva Pro авах / үнэ асуух
          if (
            message.includes("canva") ||
            message.includes("авах") ||
            message.includes("avay") ||
            message.includes("pro")
          ) {
            await sendCanvaInfo(senderId);
          }

          // Төлбөр хийх хүсэлт
          else if (
            message.includes("төлбөр") ||
            message.includes("tulbur") ||
            message.includes("авъя") ||
            message.includes("avya")
          ) {
            await sendPaymentInfo(senderId);
          }

          // Бусад мессеж
          else {
            await sendMessage(
              senderId,
              "Сайн байна уу 👋\n\nMongol AI-д тавтай морил!\n\n🎨 Canva Pro авах бол \"Canva Pro авъя\" гэж бичээрэй."
            );
          }
        }

        // =========================
        // IMAGE / SCREENSHOT
        // =========================
        if (event.message?.attachments) {
          const hasImage = event.message.attachments.some(
            (attachment) => attachment.type === "image"
          );

          if (hasImage) {
            await sendMessage(
              senderId,
              "✅ Төлбөрийн баримтын зургийг хүлээн авлаа.\n\n⏳ Админ төлбөрийг шалгаад баталгаажуулна.\n\nТөлбөр баталгаажсаны дараа дараагийн алхмыг танд автоматаар мэдэгдэнэ."
            );

            console.log(
              "Payment screenshot received from:",
              senderId
            );
          }
        }
      }
    }

    return res.status(200).send("EVENT_RECEIVED");
  }

  return res.status(405).send("Method Not Allowed");
}


// ==========================================
// CANVA PRO INFORMATION
// ==========================================

async function sendCanvaInfo(recipientId) {
  const text =
    "🎨 CANVA PRO\n\n" +
    "1 жилийн эрх — 25,000₮\n\n" +
    "✨ Canva Pro-ийн premium боломжууд\n" +
    "✨ Premium template, element ашиглах\n" +
    "✨ Background remover\n" +
    "✨ Magic Resize\n" +
    "✨ Premium зураг, видео, font\n" +
    "✨ Илүү олон AI боломж\n\n" +
    "Canva Pro авах бол доорх товчийг дарна уу 👇";

  await sendMessageWithButton(
    recipientId,
    text,
    "Авах"
  );
}


// ==========================================
// PAYMENT INFORMATION
// ==========================================

async function sendPaymentInfo(recipientId) {
  const text =
    "💳 ТӨЛБӨРИЙН МЭДЭЭЛЭЛ\n\n" +
    "🎨 Canva Pro — 1 жил\n" +
    "💰 Төлбөр: 25,000₮\n\n" +
    "🏦 Банк: Khan Bank\n" +
    "💳 Данс: 5037598829\n\n" +
    "📋 IBAN:\n" +
    "MN890005005037598829\n\n" +
    "⬆️ IBAN дээр удаан дарж COPY хийгээд шууд банкны апп дээрээ PASTE хийж болно.\n\n" +
    "Төлбөр хийсний дараа төлбөрийн баримтын SCREENSHOT-оо энд илгээнэ үү.\n\n" +
    "⚠️ Төлбөрийг админ гараар шалгаж баталгаажуулна.";

  await sendMessage(recipientId, text);
}


// ==========================================
// SEND MESSAGE
// ==========================================

async function sendMessage(recipientId, text) {
  const token = process.env.META_PAGE_ACCESS_TOKEN;

  const response = await fetch(
    `https://graph.facebook.com/v24.0/me/messages?access_token=${token}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: {
          id: recipientId,
        },
        message: {
          text,
        },
      }),
    }
  );

  if (!response.ok) {
    console.error("Messenger API error:", await response.text());
  }
}


// ==========================================
// QUICK REPLY BUTTON
// ==========================================

async function sendMessageWithButton(
  recipientId,
  text,
  buttonTitle
) {
  const token = process.env.META_PAGE_ACCESS_TOKEN;

  const response = await fetch(
    `https://graph.facebook.com/v24.0/me/messages?access_token=${token}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: {
          id: recipientId,
        },
        message: {
          text,
          quick_replies: [
            {
              content_type: "text",
              title: buttonTitle,
              payload: "BUY_CANVA_PRO",
            },
          ],
        },
      }),
    }
  );

  if (!response.ok) {
    console.error("Messenger API error:", await response.text());
  }
}
