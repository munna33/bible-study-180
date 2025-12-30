const express = require("express");
const router = express.Router();
const credentials = require("../config.js");
const multer = require("multer");
const cors = require("cors");
const bodyParser = require("body-parser");
// const admin = require("firebase-admin");
const { result } = require("lodash");
const { google } = require("googleapis");
const NodeCache = require("node-cache");
const sheetCache = new NodeCache({ stdTTL: 60 }); // cache 60s (tweak as needed)
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
     const cacheKey = `bibleSchedule${req.params.id}`;
      const cached = sheetCache.get(cacheKey);
      if (cached) {
        console.log("✅ Serving from cache");
        return cached;
      }
    const response = await googleSheetsInstance.spreadsheets.values.get({
        auth,
        spreadsheetId: req.params.id,
        range: "Batch6!A2:D342",
      });
      const formattedSchedule = formatSchedule(response.data.values);
      sheetCache.set(cacheKey, formattedSchedule)
      res.status(200).send(formattedSchedule);
  } catch (error) {
    console.error("Error fetching Bible Study schedule:", error);
    res.status(500).send("Internal Server Error");
  }
});
router.get("/dailyQuiz/:id", async (req,res) => {
  try {
    const response = await googleSheetsInstance.spreadsheets.get({
      auth,
      spreadsheetId: req.params.id,
    });
    const result = response.data.sheets.map((item) => {
    return {
      title: item.properties.title,
      sheetId: item.properties.sheetId,
      index: item.properties.index,
    };
  });
    // const formattedSchedule = formatSchedule(response.data.values);
    const indexes = ["Day", "Date", "Chapter", "Question", "Options", "Answer","Reference","QType"]
    respData = await getAllSpreadsheetData(result, req, indexes).then((data) => {
    // const formatData = formatAllSheetData(data);
    const responseObj = data['Daily_Quiz'].find((item) => {
      return item['Day'] === req.query.day
    })
    res.json(responseObj);
  });
    // res.status(200).send(response);
  } catch(error) {
    console.error("Error fetching Bible Study schedule:", error);
    res.status(500).send("Internal Server Error");
  }
})
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
async function getAllSpreadsheetData(result, req, indexes) {
  const cacheKey = `allQuizData_${req.params.id}`;
  const cached = sheetCache.get(cacheKey);
  if (cached) {
    console.log("✅ Serving from cache");
    return cached;
  }

  // Build ranges for all sheets except registrations
  const ranges = result
    .filter(
      (item) =>
        item.title !== "Registrations" && item.title !== "B180_Registrations"
    )
    .map((item) => item.title);

  // Single API call instead of N
  const batchRes = await googleSheetsInstance.spreadsheets.values.batchGet({
    auth,
    spreadsheetId: req.params.id,
    ranges,
  });

  const responseData = {};
  batchRes.data.valueRanges.forEach((range, i) => {
    const sheetTitle = ranges[i];
    const values = range.values || [];
    responseData[sheetTitle] = formatRowData(indexes, values);
  });

  // Store in cache
  sheetCache.set(cacheKey, responseData);
  console.log("📊 Fresh data fetched from Google Sheets");
  return responseData;
}
function formatRowData(keys, data) {
  let result = [];
  if (data) {
    for (let i = 1; i < data.length; i++) {
      if (data[i].length > 0) {
        let obj = {};
        data[i].forEach((element, index) => {
          obj[keys[index]] = element;
        });
        result.push(obj);
      }
    }
  }

  return result;
}

module.exports = router;