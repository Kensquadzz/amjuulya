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

  // Receive Messenger events
  if (req.method === "POST") {
    const body = req.body;

    if (body.object === "page") {
      for (const entry of body.entry || []) {
        for (const event of entry.messaging || []) {
          if (event.message?.text) {
            const senderId = event.sender.id;
            const message = event.message.text;

            console.log("Messenger:", senderId, message);

            // Temporary test reply
            await sendMessage(
              senderId,
              "Сайн байна уу 👋 Mongol AI-д тавтай морил!"
            );
          }
        }
      }

      return res.status(200).send("EVENT_RECEIVED");
    }

    return res.status(404).send("Not a page event");
  }

  return res.status(405).send("Method Not Allowed");
}

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
    console.error(await response.text());
  }
}
