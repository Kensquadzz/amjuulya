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
      const pageId = entry.id;

      // ======================================
      // POST / ЗАР ДЭЭРХ COMMENT
      // Comment бичсэн хүнд Messenger-ээр мэдээлэл
      // автоматаар илгээнэ. Meta дээр "feed" захиалсан байх ёстой.
      // ======================================

      for (const change of entry.changes || []) {
        const value = change.value || {};

        const isNewComment =
          change.field === "feed" &&
          value.item === "comment" &&
          value.verb === "add";

        // Page өөрөө бичсэн comment-д хариулахгүй
        if (!isNewComment || value.from?.id === pageId) continue;

        console.log("Comment:", value.comment_id, value.message);

        await handleComment(value.comment_id);
      }

      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id;

        if (!senderId) continue;

        // ======================================
        // 0. ADMIN-ИЙН МЕССЕЖ (echo)
        // Админ Page inbox-оос "Төлбөр баталгаажлаа" гэж
        // бичихэд Meta руу Purchase event илгээнэ.
        // Meta дээр "message_echoes" захиалсан байх ёстой.
        // ======================================

        if (event.message?.is_echo) {
          const fromBot = event.message.metadata === BOT_TAG;
          const text = (event.message.text || "").toLowerCase();
          const customerId = event.recipient?.id;

          if (!fromBot && customerId && isAdminConfirmation(text)) {
            const value = extractAmount(text) || DEFAULT_PRICE;

            console.log("Purchase confirmed:", customerId, value);

            await sendConversionEvent({
              eventName: "Purchase",
              pageId,
              psid: customerId,
              value,
              eventId: `purchase_${event.message.mid}`,
            });
          }

          continue;
        }

        // ======================================
        // 1. POSTBACK BUTTON
        // ======================================

        if (event.postback?.payload) {
          const payload = event.postback.payload;

          console.log("Postback:", senderId, payload);

          if (payload === "BUY_CANVA_PRO") {
            await handleBuy(senderId, pageId);
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
            await handleBuy(senderId, pageId);
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

            await sendConversionEvent({
              eventName: "ViewContent",
              pageId,
              psid: senderId,
              value: DEFAULT_PRICE,
            });
          }

          // "АВАХ" гэж гараар бичсэн
          else if (
            message.includes("авах") ||
            message.includes("avah") ||
            message.includes("авна") ||
            message.includes("avna")
          ) {
            await handleBuy(senderId, pageId);
          }

          // Төлбөрийн мэдээлэл хүссэн
          else if (
            message.includes("төлбөр") ||
            message.includes("tulbur") ||
            message.includes("данс") ||
            message.includes("iban")
          ) {
            await handleBuy(senderId, pageId);
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
// ТОХИРГОО
// ==========================================

// Ботын өөрийн мессежийг админых гэж андуурахгүйн тулд
const BOT_TAG = "MONGOL_AI_BOT";

const DEFAULT_PRICE = 25000;

// ==========================================
// АВАХ → төлбөрийн мэдээлэл + InitiateCheckout
// ==========================================

async function handleBuy(recipientId, pageId) {
  await sendPaymentInfo(recipientId);

  await sendConversionEvent({
    eventName: "InitiateCheckout",
    pageId,
    psid: recipientId,
    value: DEFAULT_PRICE,
  });
}

// ==========================================
// COMMENT → PRIVATE REPLY (Messenger)
// ==========================================

async function handleComment(commentId) {
  if (!commentId) return;

  const text =
    "Сайн байна уу 👋 Comment бичсэнд баярлалаа!\n\n" +
    "🎨 CANVA PRO — 1 жил: 25,000₮\n" +
    "✨ Premium template, AI, Background Remover, Magic Resize\n\n" +
    "Авах бол доорх товчийг дарна уу 👇";

  // 1) Messenger-ээр хувийн мессеж (comment бүрт 1 удаа)
  const sent = await sendPrivateReply(commentId, {
    text,
    metadata: BOT_TAG,
    quick_replies: [
      {
        content_type: "text",
        title: "🟢 АВАХ — 25,000₮",
        payload: "BUY_CANVA_PRO",
      },
    ],
  });

  // Товчтой хувилбар орохгүй бол энгийн текстээр дахин оролдоно
  if (!sent) {
    await sendPrivateReply(commentId, {
      text: text.replace(
        "Авах бол доорх товчийг дарна уу 👇",
        "Авах бол энд \"авах\" гэж бичээрэй 👇"
      ),
      metadata: BOT_TAG,
    });
  }

  // 2) Comment дор нь олон нийтэд харагдах хариу
  await replyToComment(
    commentId,
    "📩 Танд Messenger-ээр дэлгэрэнгүй мэдээлэл илгээлээ!"
  );
}

async function sendPrivateReply(commentId, message) {
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
          comment_id: commentId,
        },
        message,
      }),
    }
  );

  if (!response.ok) {
    console.error("Private reply error:", await response.text());
    return false;
  }

  return true;
}

async function replyToComment(commentId, message) {
  const token = process.env.META_PAGE_ACCESS_TOKEN;

  const response = await fetch(
    `https://graph.facebook.com/v24.0/${commentId}/comments?access_token=${token}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    }
  );

  if (!response.ok) {
    console.error("Comment reply error:", await response.text());
  }
}

// Админ баталгаажуулсан эсэх
function isAdminConfirmation(text) {
  return (
    text.includes("баталгаажлаа") ||
    text.includes("batalgaajlaa")
  );
}

// "45,000₮" гэх мэт дүнг олох (байхгүй бол null)
function extractAmount(text) {
  const match = text.match(/(\d[\d,.\s]*)\s*₮/);
  if (!match) return null;
  const amount = Number(match[1].replace(/[^\d]/g, ""));
  return amount > 0 ? amount : null;
}

// ==========================================
// META CONVERSIONS API (Business Messaging)
// Click-to-Messenger зарын AI-д хэн үнэхээр
// худалдаж авсныг мэдэгдэнэ.
// ==========================================

async function sendConversionEvent({ eventName, pageId, psid, value, eventId }) {
  const datasetId = process.env.META_DATASET_ID;
  const token =
    process.env.META_CAPI_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;

  // Dataset тохируулаагүй бол алгасна — бот хэвийн ажилласаар
  if (!datasetId || !token || !pageId || !psid) return;

  try {
    const response = await fetch(
      `https://graph.facebook.com/v24.0/${datasetId}/events?access_token=${token}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: [
            {
              event_name: eventName,
              event_time: Math.floor(Date.now() / 1000),
              event_id: eventId || `${eventName}_${psid}_${Date.now()}`,
              action_source: "business_messaging",
              messaging_channel: "messenger",
              user_data: {
                page_id: pageId,
                page_scoped_user_id: psid,
              },
              custom_data: {
                currency: process.env.META_CURRENCY || "MNT",
                value,
              },
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      console.error(
        `Conversions API error (${eventName}):`,
        await response.text()
      );
    }
  } catch (error) {
    console.error(`Conversions API failed (${eventName}):`, error);
  }
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
          metadata: BOT_TAG,
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
          metadata: BOT_TAG,
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
