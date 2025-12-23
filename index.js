const express = require("express");
const youtubeRouter = require('./routes/youtube');
const adminRouter = require('./routes/admin');
const whatsappRouter = require('./routes/whatsapp');
const NodeCache = require("node-cache");
const sheetCache = new NodeCache({ stdTTL: 60 }); // cache 60s (tweak as needed)

//googleapis
const { google } = require("googleapis");
const cors = require("cors");
const bodyParser = require("body-parser");
const credentials = require("./config.js");

//initilize express
const app = express();
app.use(express.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

app.use(
  cors({
    origin: "*",
  })
);
app.use('/youtube', youtubeRouter);
app.use('/admin', adminRouter);
app.use('/whatsapp', whatsappRouter);
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

app.get("/sheet/:spreasheetId/:id", async (req, res) => {
  //Read front the spreadsheet
  const readData = await googleSheetsInstance.spreadsheets.values.get({
    auth, //auth object
    spreadsheetId: req.params.spreasheetId, // spreadsheet id
    range: req.params.id, //range of cells to read from.
  });

  //send the data reae with the response
  const result = formatRowData(readData.data.values[0], readData.data.values);
  res.send(result);
});
app.get("/doc/:id", async (req, res) => {
  try {
    const readDocResponse = await googleFormInstance.forms.get({
      auth,
      formId: req.params.id,
    });
    const responseData = readDocResponse.data;
    const result = {
      formTitle: responseData.info.title,
      formID: responseData.formId,
      items: responseData.items[2],
      linkedSheetId: responseData.linkedSheetId,
      formUrl: responseData.responderUri,
    };
    res.send(result);
  } catch (err) {
    res.send({});
  }
});

app.get("/sheets/:id", async (req, res) => {
  const spreadsheets = await googleSheetsInstance.spreadsheets.get({
    auth, //auth object
    spreadsheetId: req.params.id,
  });

  const result = spreadsheets.data.sheets.map((item) => {
    return {
      title: item.properties.title,
      sheetId: item.properties.sheetId,
      index: item.properties.index,
    };
  });
  res.send(result);
});
// retrieves google forms from drive
app.get("/forms", async (req, res) => {
  const driveFiles = await googleDriveInstance.files.list({
    auth,
    fields: "nextPageToken, files(id, name)",
  });
  let result = driveFiles.data.files;
  // result = result.filter(item => item.name.startsWith('BS180_'));
  res.send(result);
});
app.put("/sheet/score/:id", async (req, res) => {
  const updateSheet = await googleSheetsInstance.spreadsheets.values.update({
    auth,
    spreadsheetId: req.params.id,
    range: "Day1!B2",
    valueInputOption: "USER_ENTERED",
    resource: {
      values: [[2]],
    },
  });
  res.send(updateSheet);
});
app.get("/score/:id", async (req, res) => {
  const spreadsheets = await googleSheetsInstance.spreadsheets.get({
    auth, //auth object
    spreadsheetId: req.params.id,
  });
  let response = { data: [] };
  // res.send(spreadsheets)
  const result = spreadsheets.data.sheets.map((item) => {
    return {
      title: item.properties.title,
      sheetId: item.properties.sheetId,
      index: item.properties.index,
    };
  });
  // result.splice(0,1);
  // getLastMonthData(req).then(async (responseData) => {
  //   let respData = [];
  //   const indexes = [
  //     "Date",
  //     "Score",
  //     "FullName",
  //     "RegID",
  //     "Answer",
  //     "Reference",
  //   ];
  //   respData = await getAllSpreadsheetData(result, req, indexes).then(
  //     (data) => {
  //       const formatData = formatAllSheetData(data, responseData);
  //       res.json(formatData);
  //     }
  //   );
  // });
  let respData = [];
  const indexes = ["Date", "Score", "FullName", "RegID", "Answer", "Reference"]
  respData = await getAllSpreadsheetData(result, req, indexes).then((data) => {
    const formatData = formatAllSheetData(data);
    res.json(formatData);
  });
});
app.post("/login/:id", async (req, res) => {
  const spreadsheets = await googleSheetsInstance.spreadsheets.get({
    auth, //auth object
    spreadsheetId: req.params.id,
  });
  let response = { data: [] };
  // res.send(spreadsheets)
  const result = spreadsheets.data.sheets.map((item) => {
    return {
      title: item.properties.title,
      sheetId: item.properties.sheetId,
      index: item.properties.index,
    };
  });
  // result.splice(0,1);
  let respData = [];
  const indexes = [
    "RegID",
    "Name",
    "Church",
    "Contact",
    "Village",
    "Occupation",
    "Remarks",
  ];
  respData = await login(result, req, indexes).then((data) => {
    res.json(data);
  });
});
app.get("/getLastMonthData/:id", async (req, res) => {
  const spreadsheets = await googleSheetsInstance.spreadsheets.get({
    auth, //auth object
    spreadsheetId: req.params.id,
  });
  const result = spreadsheets.data.sheets.map((item) => {
    return {
      title: item.properties.title,
      sheetId: item.properties.sheetId,
      index: item.properties.index,
    };
  });
  const indexes = [
    "Rank",
    "Full Name",
    "RegistrationID",
    "Score",
    "Total Score",
    "No Of Days Attended",
  ];
  getLastMonthData(result, req, indexes).then((data) => {
    res.json(data);
  });
});

app.get("/getOnlineQuiz/score/:id", async(req,res) => {
    const spreadsheets = await googleSheetsInstance.spreadsheets.get({
    auth, //auth object
    spreadsheetId: req.params.id,
  });
  let response = { data: [] };
  // res.send(spreadsheets)
  const result = spreadsheets.data.sheets.map((item) => {
    return {
      title: item.properties.title,
      sheetId: item.properties.sheetId,
      index: item.properties.index,
    };
  });
  let respData = [];
  const indexes = ["RegistrationID", "Name", "QuizID", "YourScore", "TotalScore", "Q1","Q2", "Q3","Q4", "Q5","Q6", "Q7","Q8", "Q9","Q10"]
  respData = await getAllSpreadsheetData(result, req, indexes).then((data) => {
    // const formatData = formatAllSheetData(data);
    res.json(sortByProperty(data));
  });
})
async function getLastMonthData(req) {
  const indexes = [
    "Rank",
    "Full Name",
    "RegistrationID",
    "Score",
    "Total Score",
    "No Of Days Attended",
  ];
  const spreadsheets = await googleSheetsInstance.spreadsheets.get({
    auth, //auth object
    spreadsheetId: "1RatZn8cZzgDk15xFQ9Azrv1FZTPJPMw2nQMlWxCDwVQ", //req.params.id, //marks sheet
  });
  const result = spreadsheets.data.sheets.map((item) => {
    return {
      title: item.properties.title,
      sheetId: item.properties.sheetId,
      index: item.properties.index,
    };
  });
  // if(result && result.length > 0) {
  let getLastMothData = {};
  await Promise.all(
    result.map(async (item) => {
      if (item.title == "LastMonthScore") {
        const response = await googleSheetsInstance.spreadsheets.values.get({
          auth, //auth object
          spreadsheetId: "1RatZn8cZzgDk15xFQ9Azrv1FZTPJPMw2nQMlWxCDwVQ", //req.params.id,
          range: item.title,
        });

        getLastMothData = formatRowData(indexes, response.data.values);
      }
    })
  );
  return getLastMothData;
  // }
}
async function login(result, req, indexes) {
  let responseData = {};
  const groupName = req.body.appType === 'NEW' ? "New Testament": "Old_New Testament";
  await Promise.all(
    result.map(async (item) => {
      if (item.title === groupName) {
        const allSpreadSheetData =
          await googleSheetsInstance.spreadsheets.values.get({
            auth, //auth object
            spreadsheetId: req.params.id,
            range: item.title,
          });
        const userDetails = formatRowData(
          indexes,
          allSpreadSheetData.data.values
        );
        // console.log('req', req.body)
        responseData["user"] = userDetails.find(
          (item) => item.RegID.trim().toLowerCase() === req.body.regID.trim().toLowerCase()
        );
      }
    })
  );
   return responseData;
}
async function getAllSpreadsheetData(result, req, indexes) {
  // let responseData = {};
  // //   return await new Promise((resolve, reject) => {
  // await Promise.all(
  //   result.map(async (item) => {
  //     if (
  //       item.title !== "Registrations" &&
  //       item.title !== "B180_Registrations"
  //     ) {
  //       const allSpreadSheetData =
  //         await googleSheetsInstance.spreadsheets.values.get({
  //           auth, //auth object
  //           spreadsheetId: req.params.id,
  //           range: item.title,
  //         });
  //       responseData[item.title] = formatRowData(
  //         indexes,
  //         allSpreadSheetData.data.values
  //       );
  //       // responseData[item.title] = allSpreadSheetData.data.values;
  //     }
  //   })
  // );
  // return responseData;
  const cacheKey = `allData_${req.params.id}`;
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
function formatAllSheetData(data, lastMonthData) {
  const groupedData = {};
  for (const day in data) {
    const entries = data[day];
    if (entries && entries.length > 0) {
      Object.entries(entries).forEach((entry, index) => {
        const [key, value] = entry;
        let lastMonthvalue = {};
        if (lastMonthData && lastMonthData.length > 0) {
          lastMonthvalue = lastMonthData.find(
            (item) =>
              item.RegistrationID.toUpperCase().trim() ==
              value["RegID"].toUpperCase().trim()
          );
        }

        if (value && value["RegID"] && index !== entries.length - 1) {
          if (entry.length >= 0) {
            // Make sure the entry has at least Registration ID
            const registrationId = value["RegID"].trim(); // Assuming Registration ID is at index 2
            value["Day"] = day;
            if (!groupedData[registrationId.toUpperCase()]) {
              groupedData[registrationId.toUpperCase()] = { data: [value] };
            } else {
              // const dateObj = new Date(value["Date"].split(' ')[0]);
              const currentDay = value["Day"] = day;
              groupedData[registrationId.toUpperCase()]['data'] = groupedData[registrationId.toUpperCase()].data.filter(dataItem =>  {
                const newDateObj = new Date(dataItem.Date.split(' ')[0]);
                if(currentDay !== dataItem.Day) {
                  return true;
                }
              })
              groupedData[registrationId.toUpperCase()].data.push(value)
            }

            let score = 0;
            let totalScore = 0;
            let lastMonthnoOfDays = 0;
            if (lastMonthvalue && lastMonthvalue.Score) {
              score =
                parseFloat(
                  getTotalScore(groupedData[registrationId.toUpperCase()].data)
                ) + parseFloat(lastMonthvalue.Score);
              totalScore =
                parseFloat(
                  getCompleteScore(
                    groupedData[registrationId.toUpperCase()].data
                  )
                ) + parseFloat(lastMonthvalue["Total Score"]);
              lastMonthnoOfDays =
                parseInt(
                  groupedData[registrationId.toUpperCase()].data.length
                ) + parseInt(lastMonthvalue["No Of Days Attended"]);
            } else {
              score = parseFloat(
                getTotalScore(groupedData[registrationId.toUpperCase()].data)
              );
              totalScore = parseFloat(
                getCompleteScore(groupedData[registrationId.toUpperCase()].data)
              );
              lastMonthnoOfDays =
                groupedData[registrationId.toUpperCase()].data.length;
            }
            groupedData[registrationId.toUpperCase()]["score"] = score;
            groupedData[registrationId.toUpperCase()]["totalScore"] =
              totalScore;
            groupedData[registrationId.toUpperCase()]["fullName"] =
              value["FullName"];
            groupedData[registrationId.toUpperCase()]["registrationID"] =
              value["RegID"];
            groupedData[registrationId.toUpperCase()]["noOfDays"] =
              lastMonthnoOfDays;
            groupedData[registrationId.toUpperCase()]["lastMonthScore"] =
              lastMonthvalue ? parseInt(lastMonthvalue.Score) : 0;
          }
        }
      });
    }
  }
  return groupedData;
}
function getTotalScore(data) {
  let result = 0.0;
  data.forEach((item) => {
    result =
      parseFloat(result) + parseFloat(item["Score"].split("/")[0].trim());
  });
  return parseFloat(result);
}
function getCompleteScore(data) {
  let result = 0.0;
  if (data && data.length > 0) {
    data.forEach((item) => {
      result = parseFloat(result) + parseFloat(item["Score"].split("/")[1]);
    });
  }
  return result;
}

app.get("/questionPaper/:id", async (req, res) => {
  const spreadsheets = await googleSheetsInstance.spreadsheets.get({
    auth, //auth object
    spreadsheetId: req.params.id,
  });
  let response = { data: [] };
  // res.send(spreadsheets)
  const result = spreadsheets.data.sheets.map((item) => {
    return {
      title: item.properties.title,
      sheetId: item.properties.sheetId,
      index: item.properties.index,
    };
  });
  // result.splice(0,1);
  let respData = [];
  const indexes = ["QNO", "Question", "Answer", "Reference", "Options"];
  respData = await getAllSpreadsheetData(result, req, indexes).then((data) => {
    //   const formatData = formatAllSheetData(data);
    //   res.json(formatData);
    res.json(data);
  });
});
let port = process.env.PORT || 5001;
let projectId = process.env.PROJECT_ID || "bible-study-446706";
app.listen(port, () => {
  console.log("server is running on", port);
});

app.post("/getScoreByID/:id/", async (req, res) => {
  const spreadsheets = await googleSheetsInstance.spreadsheets.get({
    auth, //auth object
    spreadsheetId: req.params.id,
  });
  let response = { data: [] };
  // res.send(spreadsheets)
  const result = spreadsheets.data.sheets.map((item) => {
    return {
      title: item.properties.title,
      sheetId: item.properties.sheetId,
      index: item.properties.index,
    };
  });
  // result.splice(0,1);
  let respData = [];
  const indexes = ["Date", "Score", "FullName", "RegID", "Answer", "Reference"];
  respData = await getAllSpreadsheetData(result, req, indexes).then((data) => {
    const formatData = formatAllSheetData(data, []);
    const getUserData = getUserDataByID(req.body.regID, formatData);
    res.json(getUserData);
  });
});
app.get("/getOnlineQuiz/:id", async (req, res) => {
  const spreadsheets = await googleSheetsInstance.spreadsheets.get({
    auth, //auth object
    spreadsheetId: req.params.id,
  });

  const result = spreadsheets.data.sheets.map((item) => {
    return {
      title: item.properties.title,
      sheetId: item.properties.sheetId,
      index: item.properties.index,
    };
  });
  let responseData = [];
  const indexes = [
    "QNO",
    "Question",
    "Options",
    "Answer",
    "Reference"
  ];
  // const indexes = [
  //   "BookNo",
  //   "QNO",
  //   "Question",
  //   "Options",
  //   "Answer",
  //   "Reference",
  //   "Book Name",
  //   "Level"
  // ];
  responseData = getAllQuizData(result, req, indexes).then((data) => {
    // res.json(data);
    const exmaNames = Object.keys(data);
    let randomQuestionsData = {};
    exmaNames.forEach((item) => {
      randomQuestionsData[item] = randomQuestions(data, item);
    });

    res.json(randomQuestionsData) ;
    // return randomQuestionsData;
  });
});
app.get("/getOnlineFinalQuiz/:id", async (req, res) => {
  const spreadsheets = await googleSheetsInstance.spreadsheets.get({
    auth, //auth object
    spreadsheetId: req.params.id,
  });

  const result = spreadsheets.data.sheets.map((item) => {
    return {
      title: item.properties.title,
      sheetId: item.properties.sheetId,
      index: item.properties.index,
    };
  });
  let responseData = [];
  // const indexes = [
  //   "QNO",
  //   "Question",
  //   "Options",
  //   "Answer",
  //   "Reference"
  // ];
  const indexes = [
    "BookNo",
    "QNO",
    "Question",
    "Options",
    "Answer",
    "Reference",
    "Book Name",
    "Level"
  ];
  responseData = getAllQuizData(result, req, indexes).then((data) => {
    // res.json(data);
    const exmaNames = Object.keys(data);
    let randomQuestionsData = {};
    exmaNames.forEach((item) => {
      randomQuestionsData[item] = randomQuestions(data, item);
    });

    res.json(randomQuestionsData) ;
    // return randomQuestionsData;
  });
});
async function getAllQuizData(result, req, indexes) {
  let responseData = {};
  //   return await new Promise((resolve, reject) => {
  await Promise.all(
    result.map(async (item) => {
      // if (item.title !== "Registrations" && item.title !== "B180_Registrations") {

      const allSpreadSheetData =
        await googleSheetsInstance.spreadsheets.values.get({
          auth, //auth object
          spreadsheetId: req.params.id,
          range: item.title,
        });
      responseData[item.title] = formatRowData(
        indexes,
        allSpreadSheetData.data.values
      );
      // responseData[item.title] = allSpreadSheetData.data.values;
      // }
    })
  );
  return responseData;
}
function getUserDataByID(userID, data) {
  return { userData: data[userID] };
}
app.post("/quiz/track/:id", async(req,res)=> {
const spreadsheets = await googleSheetsInstance.spreadsheets.get({
    auth, //auth object
    spreadsheetId: req.params.id,
  });

  const result = spreadsheets.data.sheets.map((item) => {
    return {
      title: item.properties.title,
      sheetId: item.properties.sheetId,
      index: item.properties.index,
    };
  });
  insertData(req, req.body["Quiz ID"].trim()).then((data) => {
    if (data) {
      res.json({ message: "Quiz submitted successfully" });
    } else {
      res.json({ message: "Something went wrong. Please try again!" });
    }
  });
})
app.get("/quiz/track/getDetails/:id", async(req, res) => {
   const spreadsheets = await googleSheetsInstance.spreadsheets.get({
    auth, //auth object
    spreadsheetId: req.params.id,
  });

  const result = spreadsheets.data.sheets.map((item) => {
    return {
      title: item.properties.title,
      sheetId: item.properties.sheetId,
      index: item.properties.index,
    };
  });

  getQuizSheetsData(result, req, res).then((data) => {
    res.json(data);
  });
})
app.post("/submitQuiz/:id", async (req, res) => {
  const spreadsheets = await googleSheetsInstance.spreadsheets.get({
    auth, //auth object
    spreadsheetId: req.params.id,
  });

  const result = spreadsheets.data.sheets.map((item) => {
    return {
      title: item.properties.title,
      sheetId: item.properties.sheetId,
      index: item.properties.index,
    };
  });
  insertData(req, req.body["Quiz ID"].trim()).then((data) => {
    if (data) {
      res.json({ message: "Quiz submitted successfully" });
    } else {
      res.json({ message: "Something went wrong. Please try again!" });
    }
  });
});

app.get("/quizDetails/:id", async (req, res) => {
  const spreadsheets = await googleSheetsInstance.spreadsheets.get({
    auth, //auth object
    spreadsheetId: req.params.id,
  });

  const result = spreadsheets.data.sheets.map((item) => {
    return {
      title: item.properties.title,
      sheetId: item.properties.sheetId,
      index: item.properties.index,
    };
  });

  getQuizSheetsData(result, req, res).then((data) => {
    res.json(data);
  });
  // res.json(this.getQuizSheetsData) ;
});
app.get("/getPuzzle/score/:id", async(req, res) => {
   const spreadsheets = await googleSheetsInstance.spreadsheets.get({
    auth, //auth object
    spreadsheetId: req.params.id,
  });
  let response = { data: [] };
  // res.send(spreadsheets)
  const result = spreadsheets.data.sheets.map((item) => {
    return {
      title: item.properties.title,
      sheetId: item.properties.sheetId,
      index: item.properties.index,
    };
  });
  let respData = [];
  const indexes = ["SNO", "RegistrationID", "YourScore", "TotalScore", "AdditionalMarks"]
  respData = await getAllSpreadsheetData(result, req, indexes).then((data) => {
    // const formatData = formatAllSheetData(data);
    res.json(sortByProperty(data));
  });
})
async function getQuizSheetsData(result, req, res) {
//   let responseData = {};
//   await Promise.all(
//     result.map(async (item) => {
//       const allSpreadSheetData =
//         await googleSheetsInstance.spreadsheets.values.get({
//           auth, //auth object
//           spreadsheetId: req.params.id,
//           range: item.title,
//         });
//       // console.log("****",allSpreadSheetData.data)
     
//       if (
//         allSpreadSheetData.data.values &&
//         allSpreadSheetData.data.values.length > 0
//       ) {
//         responseData[item.title] = formatRowData(
//           allSpreadSheetData.data.values[0],
//           allSpreadSheetData.data.values
//         );
//       }
//     })
//   );
// return responseData;
const cacheKey = `quizData_${req.params.id}`;
  const cached = sheetCache.get(cacheKey);
  if (cached) {
    console.log("✅ Quiz data from cache");
    return cached;
  }

  // Collect all sheet names
  const ranges = result.map((item) => item.title);

  // Single API call
  const batchRes = await googleSheetsInstance.spreadsheets.values.batchGet({
    auth,
    spreadsheetId: req.params.id,
    ranges,
  });

  const responseData = {};
  batchRes.data.valueRanges.forEach((range, i) => {
    const sheetTitle = ranges[i];
    const values = range.values || [];

    if (values.length > 0) {
      // Use first row as keys
      responseData[sheetTitle] = formatRowData(values[0], values);
    }
  });

  // Save in cache
  sheetCache.set(cacheKey, responseData);
  console.log("📊 Fresh quiz data fetched from Google Sheets");
  return responseData;
}
 function randomQuestions(spreadsheetData, item) {
    // const groupedByBookName = spreadsheetData[item].reduce((acc, item) => {
    //   const key =item['Book Name'];
    //   if (!acc[key]) {
    //     acc[key] = [];
    //   }
    //   acc[key].push(item);
    //   return acc;
    // }, {});
    // // console.log('groupedBy 0', groupedByBookName)
    // let result = []
    // let lowLevelItems = []
    // for(const key in groupedByBookName) {
    //   if(groupedByBookName.hasOwnProperty(key)){
    //     let randomItem = groupedByBookName[key].filter(item => item.Level == 'H')
    //    randomItem = randomItem[Math.floor(Math.random() * randomItem.length)];
    //    lowLevelItems = [...lowLevelItems].concat((groupedByBookName[key].filter(item => item.Level == 'M')))
    //     result.push(randomItem);
    //   }
    // }
    // // console.log('result', result)
    // result = ammendLowLevelQuestions(result, lowLevelItems,item== 'Online Exam 1' ? 11 : 3 )

    return spreadsheetData[item].sort(() => Math.random() - 0.5).slice(0, 10);
  }
function ammendLowLevelQuestions(highQuestions, lowQuestions, size) {
  let copy = [...lowQuestions];
  let result = [];

  for (let i = 0; i < size; i++) {
    const index = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(index, 1)[0]); // remove and push
  }
  return highQuestions.concat(result);
}
async function insertData(req, sheet) {
  // console.log('sheet name', sheet)
  const spreadsheetId = req.params.id;
  let sheetName = sheet?.replace(/'/g, "\\'"); // Escape single quotes
  const headers = Object.keys(req.body);
  const columnCount = headers.length;
  // const lastColumnLetter = String.fromCharCode(64 + columnCount);
  const lastColumnLetter = getExcelColumnName(columnCount+5);

  const googleSheets = googleSheetsInstance.spreadsheets;
  try {
    // Fetch existing sheets
    const sheetsResponse = await googleSheets.get({ auth, spreadsheetId });
    const existingSheets = sheetsResponse.data.sheets.map(
      (s) => s.properties.title
    );

    // Create sheet if it does not exist
    if (!existingSheets.includes(sheetName)) {
      await googleSheets.batchUpdate({
        auth,
        spreadsheetId,
        resource: {
          requests: [
            {
              addSheet: {
                properties: { title: sheetName },
              },
            },
          ],
        },
      });
      // console.log(`Sheet '${sheetName}' created.`);
    }

    // Define header range
    const headerRange = `'${sheetName}'!A1:${lastColumnLetter}1`;
    const headerResource = { values: [headers] };

    // Check if headers are already present
    const existingHeaders = await googleSheets.values
      .get({
        auth,
        spreadsheetId,
        range: headerRange,
      })
      .catch(() => null);

    if (
      !existingHeaders?.data?.values ||
      existingHeaders.data.values[0].some((cell) => cell === "")
    ) {
      await googleSheets.values.update({
        auth,
        spreadsheetId,
        range: headerRange,
        valueInputOption: "RAW",
        resource: headerResource,
      });
      console.log("Headers inserted:", headers);
    } else {
      console.log("Headers already present.");
    }

    // Determine next available row
    const data = await googleSheets.values
      .get({
        auth,
        spreadsheetId,
        range: `'${sheetName}'!A:A`,
      })
      .catch(() => null);

    const nextRow = data?.data?.values ? data.data.values.length + 1 : 2;
    const range = `'${sheetName}'!A${nextRow}:${lastColumnLetter}${nextRow}`;

    const values = [Object.values(req.body)];
    // console.log("Values to Insert:", values);

    // Insert data
    const response = await googleSheets.values.update({
      auth,
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      resource: { values },
    });

    // console.log("Data inserted:", response.data);
    return true;
  } catch (error) {
    console.error("Error inserting data:", error);
    return false;
  }
}
function getExcelColumnName(n) {
    let columnName = '';
    while (n > 0) {
        let rem = (n - 1) % 26;
        columnName = String.fromCharCode(65 + rem) + columnName;
        n = Math.floor((n - 1) / 26);
    }
    return columnName;
}
function sortByProperty(data) {
    for (const key in data) {
      data[key].sort((a, b) => b['YourScore'] - a['YourScore']);
    }
return data;
}
