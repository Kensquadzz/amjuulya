export default async function handler(req, res) {
  // ==========================================
  // META WEBHOOK VERIFICATION
  // ==========================================

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

  // ==========================================
  // MESSENGER EVENTS
  // ==========================================

  if (req.method === "POST") {
    const body = req.body;

    if (body.object !== "page") {
      return res.status(404).send("Not a page event");
    }

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id;

        if (!senderId) continue;

        // ======================================
        // 1. POSTBACK BUTTON
        // ======================================

        if (event.postback?.payload) {
          const payload = event.postback.payload;

          console.log("Postback:", senderId, payload);

          if (payload === "BUY_CANVA_PRO") {
            await sendPaymentInfo(senderId);
          }

          continue;
        }

        // ======================================
        // 2. QUICK REPLY (АВАХ chip)
        // Quick reply нь "messages" event-ээр ирдэг тул
        // messaging_postbacks тохиргооноос хамаарахгүй.
        // ======================================

        if (event.message?.quick_reply?.payload) {
          const payload = event.message.quick_reply.payload;

          console.log("Quick reply:", senderId, payload);

          if (payload === "BUY_CANVA_PRO") {
            await sendPaymentInfo(senderId);
          }

          continue;
        }

        // ======================================
        // 3. TEXT MESSAGE
        // ======================================

        if (event.message?.text && !event.message?.is_echo) {
          const message = event.message.text.trim().toLowerCase();

          console.log("Messenger:", senderId, message);

          // Canva Pro хүсэлт
          if (
            message.includes("canva") ||
            message.includes("канва")
          ) {
            await sendCanvaInfo(senderId);
          }

          // "АВАХ" гэж гараар бичсэн
          else if (
            message.includes("авах") ||
            message.includes("avah") ||
            message.includes("авна") ||
            message.includes("avna")
          ) {
            await sendPaymentInfo(senderId);
          }

          // Төлбөрийн мэдээлэл хүссэн
          else if (
            message.includes("төлбөр") ||
            message.includes("tulbur") ||
            message.includes("данс") ||
            message.includes("iban")
          ) {
            await sendPaymentInfo(senderId);
          }

          // Бусад мессеж
          else {
            await sendMessage(
              senderId,
              "Сайн байна уу 👋\n\n" +
              "🇲🇳 Mongol AI-д тавтай морил!\n\n" +
              "🎨 Canva Pro авах бол \"Canva Pro авъя\" гэж бичээрэй."
            );
          }
        }

        // ======================================
        // 3. PAYMENT SCREENSHOT
        // ======================================

        if (event.message?.attachments) {
          const hasImage = event.message.attachments.some(
            (attachment) => attachment.type === "image"
          );

          if (hasImage) {
            console.log(
              "Payment screenshot received from:",
              senderId
            );

            await sendMessage(
              senderId,
              "✅ Төлбөрийн баримтыг хүлээн авлаа.\n\n" +
              "⏳ Админ баталгаажуулсны дараа танд мэдэгдэх болно."
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
    "🔥 1 жилийн эрх — 25,000₮\n\n" +
    "✨ Canva Pro-ийн premium боломжууд\n" +
    "✨ Premium template, element ашиглах\n" +
    "✨ Background Remover\n" +
    "✨ Magic Resize\n" +
    "✨ Premium зураг, видео, font\n" +
    "✨ AI боломжууд\n\n" +
    "Canva Pro авах бол доорх товчийг дарна уу 👇";

  await sendCanvaPurchaseCard(recipientId);
}

// ==========================================
// BIG CANVA PURCHASE BUTTON
// ==========================================

async function sendCanvaPurchaseCard(recipientId) {
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
          attachment: {
            type: "template",
            payload: {
              template_type: "generic",
              elements: [
                {
                  title: "🎨 CANVA PRO — 1 ЖИЛ",
                  subtitle: "25,000₮ • Premium Canva боломжууд",
                  buttons: [
                    {
                      type: "postback",
                      title: "🟢 АВАХ — 25,000₮",
                      payload: "BUY_CANVA_PRO"
                    }
                  ]
                }
              ]
            }
          },
          quick_replies: [
            {
              content_type: "text",
              title: "🟢 АВАХ — 25,000₮",
              payload: "BUY_CANVA_PRO"
            }
          ]
        }
      })
    }
  );

  if (!response.ok) {
    console.error(
      "Canva purchase card error:",
      await response.text()
    );
  }
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

    "📌 IBAN-аа copy хийх:\n" +
    "MN890005005037598829\n\n" +

    "✍️ ГҮЙЛГЭЭНИЙ УТГА:\n" +
    "Өөрийн НЭР + УТАСНЫ ДУГААР-аа заавал бичнэ үү.\n" +
    "Жишээ: Бат 99112233\n\n" +

    "⬆️ Төлбөр хийсний дараа төлбөрийн баримтын SCREENSHOT-оо энд илгээнэ үү.\n\n" +

    "✅ Админ баталгаажуулсны дараа танд мэдэгдэх болно.";

  await sendMessage(recipientId, text);
}

// ==========================================
// SEND TEXT MESSAGE
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
    console.error(
      "Messenger API error:",
      await response.text()
    );
  }
}
