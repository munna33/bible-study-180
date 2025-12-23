const express = require("express");
const axios = require("axios");
const cors = require("cors");
const dotenv = require("dotenv");
const router = express.Router();
const credentials = require("../config.js");
dotenv.config();

router.use(cors());
router.use(express.json());

const TOKEN = credentials.whatsapp_token;
const PHONE_ID = credentials.phone_number_id;
const WHAPI_BASE_URL = "https://gate.whapi.cloud";
// Send WhatsApp message
router.post("/send", async (req, res) => {
  const { to, message } = req.body;

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "template",
        template: {
          name: "hello_world",
          language: { code: "en_US" },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({ success: true, data: response.data });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});

// Verify webhook
router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === "my_verify_token") {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Receive messages
router.post("/webhook", (req, res) => {
  console.log(JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});
router.post("/send-whatsapp", async (req, res) => {
  const { to, message } = req.body;

  try {
    const response = await axios.post(
      `${WHAPI_BASE_URL}/messages/text`,
      {
        to: to, // ex: "919876543210"
        body: message,
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
});

module.exports = router;
