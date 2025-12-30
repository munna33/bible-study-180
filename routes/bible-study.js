const express = require("express");
const router = express.Router();
const credentials = require("../config.js");
const multer = require("multer");
const cors = require("cors");
const bodyParser = require("body-parser");
// const admin = require("firebase-admin");
const { result } = require("lodash");
const { google } = require("googleapis");
router.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

router.use(
  cors({
    origin: "*",
  })
);
const sheets = google.sheets("v4");
   const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/forms.body",
      "https://www.googleapis.com/auth/drive",
    ],
  });
const authClientObject = auth.getClient();
const googleSheetsInstance = google.sheets({
  version: "v4",
  auth: authClientObject,
});
const googleFormInstance = google.forms({
  version: "v1",
  auth: authClientObject,
});
const googleDriveInstance = google.drive({
  version: "v3",
  auth: authClientObject,
});

router.get("/schedule/:id", async (req, res) => {
  try {
    const response = await googleSheetsInstance.spreadsheets.values.get({
        auth,
        spreadsheetId: req.params.id,
        range: "Batch6!A2:D342",
      });
      const formattedSchedule = formatSchedule(response.data.values);
      res.status(200).send(formattedSchedule);
  } catch (error) {
    console.error("Error fetching Bible Study schedule:", error);
    res.status(500).send("Internal Server Error");
  }
});
function formatSchedule(schedule) {
  const formattedSchedule = schedule.map((entry) => {
    return {    
        date: entry[0],
        scripture: entry[1],
        fullName: entry[2] || "",
        day: entry[3] || "",
    };
  });
  return formattedSchedule;
}

module.exports = router;