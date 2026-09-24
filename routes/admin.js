const express = require("express");
const router = express.Router();
const XLSX = require("xlsx");
const path = require("path");
const credentials = require("../config.js");
const fs = require("fs");
const multer = require("multer");
const cors = require("cors");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const { result, uniqueId } = require("lodash");
const { google } = require("googleapis");
const { v4: uuidv4 } = require('uuid');
const { batch } = require("googleapis/build/src/apis/batch/index.js");
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

admin.initializeApp({
  credential: admin.credential.cert(credentials),
});
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
const db = admin.firestore();
// POST endpoint to accept file and store in Firestore
router.post("/upload", async (req, res) => {
  const storage = multer.memoryStorage();
  const upload = multer({ storage: storage }).single("file");

  upload(req, res, async function (err) {
    if (err) {
      console.error(err);
      return res.status(500).send({ error: err.message });
    }
    try {
      if (!req.file) {
        return res.status(400).send({ error: "No file uploaded" });
      }
      // parentCollection is sent as a field in FormData
      const parentCollection = req.body.parentCollection;
      if (!parentCollection) {
        return res
          .status(400)
          .send({ error: "Missing parentCollection in request body" });
      }

      // Read uploaded Excel file buffer directly from multer
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });

      // Create a parent document (or use a fixed doc, e.g., "data")
      const parentDocRef = db.collection(parentCollection);

      // If only one sheet, store rows directly under the parent document as a subcollection "data"
      if (workbook.SheetNames.length === 1) {
        const sheet = XLSX.utils.sheet_to_json(
          workbook.Sheets[workbook.SheetNames[0]]
        );
        // Store each row as a document in the "data" subcollection
        // Store the entire sheet as an array in the parent document
        const docRef = db.collection(workbook.SheetNames[0]).doc("data");
        await docRef.set({ users: sheet });
      } else {
        // Multiple sheets: use sheet name as subcollection
        for (const sheetName of workbook.SheetNames) {
          const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
          const subCollectionRef = parentDocRef.doc(sheetName);
          //   for (const row of sheet) {
          // await subCollectionRef.add(row);
          //   }
          await subCollectionRef.set({ users: sheet });
        }
      }

      res.send({ message: "File uploaded and data stored successfully!" });
    } catch (error) {
      console.error(error);
      res.status(500).send({ error: error.message });
    }
  });
});
router.get("/getAllUsers", async (req, res) => {
  try {
    const appType = req.query.appType;
    const collectionList = await db.listCollections();

    // if (!collectionNames.includes("NEW")) {
    //   return res.status(404).send({ error: "USERS collection not found" });
    // }
    // Fetch all documents from USERS collection
    const users = [];
    const usersSnapshot = await db
      .collection("USERS")
      .listDocuments()
      .then((docs) =>
        Promise.all(
          docs.map(async (docRef) => {
            const doc = await docRef.get();
            return doc;
          })
        )
      );
    let results = {};
    for (const doc of usersSnapshot) {
      let userData = { id: doc.id, ...doc.data() };
      if (userData["users"] && Array.isArray(userData["users"])) {
        userData["users"].sort((a, b) => {
          if (a["Reg No"] === undefined) return 1;
          if (b["Reg No"] === undefined) return -1;
          if (a["Reg No"] < b["Reg No"]) return -1;
          if (a["Reg No"] > b["Reg No"]) return 1;
          return 0;
        });
      }
      // }
      results[doc.id] = userData["users"] || [];
      users.push(userData);
    }

    res.send(results);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});

router.post("/adminLogin", async (req, res, next) => {
  const { username, password } = req.body;

  // Leave legacy login requests for the existing login handler below.
  if (username === undefined && password === undefined) {
    return next();
  }

  try {
    const jwtSecret = process.env.ADMIN_JWT_SECRET || credentials.admin_jwt_secret;
    if (!jwtSecret) {
      return res.status(500).send({
        token: null,
        authenticated: false,
        success: false,
        admin: null,
        error: "Admin JWT secret is not configured",
      });
    }

    if (!username || !password) {
      return res.status(400).send({
        token: null,
        authenticated: false,
        success: false,
        admin: null,
        error: "username and password are required",
      });
    }

    const adminSnapshot = await db
      .collection("admin")
      .where("userName", "==", username)
      .limit(1)
      .get();

    if (adminSnapshot.empty) {
      return res.status(401).send({
        token: null,
        authenticated: false,
        success: false,
        admin: null,
        error: "Invalid username or password",
      });
    }

    const adminDocument = adminSnapshot.docs[0];
    const adminData = adminDocument.data();

    if (adminData.password !== password) {
      return res.status(401).send({
        token: null,
        authenticated: false,
        success: false,
        admin: null,
        error: "Invalid username or password",
      });
    }

    return res.send({
      token: jwt.sign(
        {
          adminId: adminDocument.id,
          username: adminData.userName,
        },
        jwtSecret,
        { expiresIn: "1d" }
      ),
      authenticated: true,
      success: true,
      admin: {
        id: adminDocument.id,
        username: adminData.userName,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send({
      token: null,
      authenticated: false,
      success: false,
      admin: null,
      error: error.message,
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const appType = req.body.appType;
    // collectionName = appType === "NEW" ? "new_testament" : "old_new_testament";
    const registrationNo = req.body.regID;
    const collectionName = `user_registrations_batch${req.body.batchNo || "6"}`;
    const usersSnapshot = await db.collection(collectionName).get();
    const users = usersSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    // const user = users.data.find(u => u['Reg No'] === registrationNo);
    const user = users.find((u) => u.id === collectionName);
    if (
      !user &&
      !user.users &&
      !user.users.length &&
      user.users.find((u) => u["Reg No"] === registrationNo)
    ) {
      return res.status(404).send({ error: "User not found" });
    } else {
      const userData = user.users.find((u) => u["Reg No"] === registrationNo);
      responseObject = {
        RegID: userData["Reg No"] || userData["registrationID"],
        Name: userData["Full Name / పూర్తి పేరు"] || userData["fullName"],
        Church: userData["Church Name / సంఘము పేరు"] || userData["churchName"],
        Contact: userData["Contact No / ఫోన్ నెం"] || userData["contactNo"],
        Village: userData["Village Name / ఊరి పేరు"] || userData["address"],
        Occupation: userData["Occupation / వృత్తి"] || userData["occupation"],
        Batch: appType,
      };
      res.send({ user: responseObject });
    }
  } catch (error) {}
});
router.get("/getAllCollections", async (req, res) => {
  try {
    const collections = await db.listCollections();
    const collectionNames = collections.map((col) => col.id);
    res.send(collectionNames);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});
router.get("/getAllUserCollections", async (req, res) => {
  try {
    const collections = await db.listCollections();
    const collectionNames = collections
      .filter((col) => col.id.includes("user_registrations"))
      .map((col) => {
        const batchNo = col.id.split("user_registrations_batch")[1];
        return {
          collectionId: col.id,
          collectionName: col.id.replaceAll("_", " ").toUpperCase(),
          batchNo: batchNo
        };
    });
    res.send(collectionNames);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});
router.get("/getProgramDetailsByBatch", async (req, res) => {
  try {
    const { batchNo } = req.query;

    if (!batchNo) {
      return res.status(400).send({ error: "batchNo is required" });
    }

    const programSnapshot = await db.collection("bible_study_programs").get();
    let program = null;

    for (const doc of programSnapshot.docs) {
      const batches = doc.data().batches || [];
      program = batches.find(
        (batch) => String(batch.batch_no) === String(batchNo)
      );

      if (program) break;
    }

    if (!program) {
      return res.status(404).send({ error: "Program batch not found" });
    }

    res.send({
      name: program.name || program.church_name,
      batch_no: program.batch_no,
      conducting_by: program.conducting_by,
      whatsappgroupLink: program.whatsapp_group_link,
      duration: program.duration,
      schedule_dates: program.schedule_dates,
      type: program.type,
      church_name: program.church_name,
      contact_no: program.contact_no, 
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});

router.post("/track", async (req, res) => {
  try {
    const isFinalQuiz = req.body.finalQuiz || false;
    if(!req.body.batchNo) {
      res.status(400).send({ error: "batchNo is required" });
    }
    const batchNo = req.body.batchNo === "6" ? "old_new" : `batch${req.body.batchNo}`;
    // const collectionName = isFinalQuiz
    //   ? "final_quiz_tracker"
    //   : appType === "NEW"
    //   ? "online_quiz_tracker_new"
    //   : "online_quiz_tracker_old_new";
    const collectionName = isFinalQuiz ? `final_quiz_tracker_${batchNo}` : `online_quiz_tracker_${batchNo}`;
    const registrationNo = req.body.regID;
    const puzzleSnapshot = await db.collection(collectionName).get();
    let puzzles = [];
    puzzleSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.users && Array.isArray(data.users)) {
        const userTrack = data.users.find(
          (u) => u["registration_id"] === registrationNo
        );
        if (userTrack) {
          puzzles.push(userTrack);
        }
      }
    });

    // Insert a new document if not found
    if (puzzles.length === 0) {
      const newTrack = {
        "Registration ID": registrationNo,
        "Name": req.body.name || "Unknown User",
        "Quiz ID": req.body.quizID || "Unknown Quiz",
        // add other fields as needed, e.g.:
        "Attempted": true,
        "Date": new Date().toISOString(),
      };
      // Replace slashes in quizID to ensure valid Firestore document ID
      const safeQuizID = req.body.quizID.replace(/\//g, "");
      const firstDocRef = db.collection(collectionName).doc(safeQuizID);
      // Add to the first document in the collection, or create a new doc
      // Check if the document exists before updating
      const docSnapshot = await firstDocRef.get();
      if (docSnapshot.exists) {
        await firstDocRef.update({
          users: admin.firestore.FieldValue.arrayUnion(newTrack),
        });
      } else {
        // If doc does not exist, create it with the new user
        await firstDocRef.set({
          users: [newTrack],
        });
      }
      puzzles.push(newTrack);
    }

    let result = puzzles;
    if (!puzzles || puzzles.length === 0) {
      return res.status(404).send({ error: "No puzzle scores found" });
    }

    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});
router.post("/getQuizTracker", async (req, res) => {
  try {
    const isFinalQuiz = req.body.finalQuiz || false;
    const batchNo = req.body.batchNo === "6" ? "old_new" : `batch${req.body.batchNo}`;
    // const collectionName = isFinalQuiz
    //   ? "final_quiz_tracker"
    //   : appType === "NEW"
    //   ? "online_quiz_tracker_new"
    //   : "online_quiz_tracker_old_new";
     const collectionName = isFinalQuiz ? `final_quiz_tracker_${batchNo}` : `online_quiz_tracker_${batchNo}`;
    const registrationNo = req.body.regID;
    const puzzleSnapshot = await db.collection(collectionName).get();
    let puzzles = [];
    puzzleSnapshot.forEach((doc) => {
      const data = doc.data();
      if (
        doc.id &&
        req.body.quizID &&
        doc.id === req.body.quizID.replace(/\//g, "")
      ) {
        if (data.users && Array.isArray(data.users)) {
          const userTrack = data.users.find(
            (u) => u["Registration ID"] === registrationNo
          );
          if (userTrack) {
            puzzles.push(userTrack);
          }
        }
      }
    });

    if (!puzzles || puzzles.length === 0) {
      return res.send({
        isAttempted: false,
        error: "No quiz tracker found for this user",
      });
    }

    res.send({ isAttempted: true, user: puzzles[0] });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});
router.post("/prayerRequest", async (req, res) => {
  try {
    const collectionName = "prayer_requests";
    const prayerData = {
      Name: req.body.name || "Unknown",
      Contact: req.body.contactNo || "Unknown",
      Address: req.body.address || "",
      PrayerRequest: req.body.request || "",
      Date: new Date().toISOString(),
    };
    const prayerRef = db.collection(collectionName).doc();
    await prayerRef.set(prayerData);
    res.send({ message: "Prayer request submitted successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});
router.get("/getAllPrayerRequests", async (req, res) => {
  try {
    const collectionName = "prayer_requests";
    const prayerSnapshot = await db.collection(collectionName).get();
    let prayers = [];
    if (prayerSnapshot && !prayerSnapshot.empty) {
      prayerSnapshot.forEach((doc) => {
        prayers.push({ id: doc.id, ...doc.data() });
      });
      res.send({ prayers: prayers.toReversed() });
    } else {
      res.send({ prayers: [] });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});
router.put("/updatePrayerRequestStatus/:id", async (req, res) => {
  try {
    const collectionName = "prayer_requests";
    const prayerId = req.params.id;
    const newStatus = req.body.status || "pending"; // Default to "pending" if not provided
    const prayerRef = db.collection(collectionName).doc(prayerId);
    const prayerDoc = await prayerRef.get();
    if (!prayerDoc.exists) {
      return res.status(404).send({ error: "Prayer request not found" });
    }
    await prayerRef.update({ Status: newStatus });
    res.send({ message: "Prayer request status updated successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});

router.post("/registerUser", async (req, res) => {
  try {
    const batchNo = req.body.batchNo || "6";
    if(!batchNo){
      return res.status(400).send({ error: "batchNo is required" });
    };
    const users = await getRegisteredUsers(batchNo);
    let regId = users[users.length - 1]
      ? users[users.length - 1].registrationID.replace(`BS${batchNo}`, "")
      : 0;
    regId = `BS${batchNo}` + `${parseInt(regId) + 1}`.padStart(3, "0");
    const collectionName = `user_registrations_batch${batchNo}`;
    const userData = {
      registrationID: regId,
      fullName: req.body.fullName || "Unknown",
      churchName: req.body.churchName || "Unknown",
      contactNo: req.body.contactNo || "Unknown",
      address: req.body.address || "",
      occupation: req.body.occupation || "",
      invitation: req.body.invitation || "",
      participationStatus: req.body.participationStatus || "pending",
      date: new Date().toISOString(),
    };
    const userRef = db.collection(collectionName).doc();
    await userRef.set(userData);

    const sheetId = req.body.sheetId; // The ID of your Google Sheet
    const range = "Registrations!A:I";

    await googleSheetsInstance.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: range,
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [
          [
            userData.registrationID,
            userData.fullName,
            userData.churchName,
            userData.contactNo,
            userData.address,
            userData.occupation,
            userData.invitation,
            userData.participationStatus,
            userData.date,
          ],
        ],
      },
      auth: auth,
    });
    res.send({
      message: "User registered successfully!",
      registrationID: userData.registrationID,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});
router.get("/getUserByNumber", async (req, res) => {
  try {
    const mobileNumber = req.query.mobileNumber;
    const batchNo = req.query.batchNo || "6";
    const users = await getRegisteredUsers(batchNo);
    const user = users.filter((u) => u.contactNo == mobileNumber);
    if (!user || user.length === 0) {
      return res.status(200).send({ users: [], message: "User not found" });
    }
    res.send({ users: user });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});

router.get("/getUsersByBatch", async (req, res) => {
  try {
    const { batchNo } = req.query;

    if (!batchNo) {
      return res.status(400).send({ error: "batchNo is required" });
    }

    const users = await getRegisteredUsers(batchNo);
    res.send({ users });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});

async function getRegisteredUsers(batchNo) {
  const collectionName = `user_registrations_batch${batchNo}`;
  const usersSnapshot = await db.collection(collectionName).get();
  let users = [];
  if (usersSnapshot && !usersSnapshot.empty) {
    usersSnapshot.forEach((doc) => {
      users.push({ id: doc.id, ...doc.data() });
    });
  }
  // if(users.length > 0){
  users.sort((a, b) => new Date(a.date) - new Date(b.date));
  // }
  return users;
}

router.post("/saveDailyQuizData", async (req, res) => {
  try {
    const batchNo = req.body.batchNo;
    if(!batchNo){
      return res.status(400).send({ error: "batchNo is required" });
    }
    const collectionName = `daily-quiz-batch${batchNo == '6' ? '-'+batchNo : batchNo}`;
    const userRef = await db.collection(collectionName).get();
    let dailyQuizData = [];
    const registrationNo = req.body.regID;
    userRef.forEach((doc) => {
      const data = doc.data();
      if (data.users && Array.isArray(data.users)) {
        const userTrack = data.users.find(
          (u) => u["Registration ID"] === registrationNo
        );
        if (userTrack) {
          dailyQuizData.push(userTrack);
        }
      }
    });
    if (dailyQuizData.length == 0) {
      const newTrack = {
        "Registration ID": registrationNo,
        "Day": req.body.day || "Unknown Day",
        "Date": req.body.date || "Unknown Date",
        "Answer": req.body.answer || "Unknow Answer",
        "Marks": req.body.marks || '0'
      };
      const firstDocRef = db
        .collection(collectionName)
        .doc("Day_" + req.body.day);
      // Add to the first document in the collection, or create a new doc
      // Check if the document exists before updating
      const docSnapshot = await firstDocRef.get();
      if (docSnapshot.exists) {
        await firstDocRef.update({
          users: admin.firestore.FieldValue.arrayUnion(newTrack),
        });
      } else {
        // If doc does not exist, create it with the new user
        await firstDocRef.set({
          users: [newTrack],
        });
      }
      dailyQuizData.push(newTrack);
    } else {
      const docId = "Day_" + req.body.day;
      const docRef = db.collection(collectionName).doc(docId);
      const docSnapshot = await docRef.get();

      const updatedTrack = {
        "Registration ID": registrationNo,
        Day: req.body.day || "Unknown Day",
        Date: req.body.date || "Unknown Date",
        Answer: req.body.answer || "Unknown Answer",
        "Marks": req.body.marks || 0
      };

      // 👉 IF document does NOT exist → CREATE
      if (!docSnapshot.exists) {
        await docRef.set({
          users: [updatedTrack],
        });

        dailyQuizData = [updatedTrack];
      } else {
        // 👉 IF document EXISTS → UPDATE existing user
        const docData = docSnapshot.data();
        const users = docData.users || [];

        const userIndex = users.findIndex(
          (u) => u.registration_id === registrationNo
        );

        // User exists → update
        if (userIndex !== -1) {
          users[userIndex] = {
            ...users[userIndex],
            Answer: req.body.answer || users[userIndex].Answer,
            Date: req.body.date || users[userIndex].Date,
            "Marks": req.body.marks || 0
          };
        }
        // User does NOT exist → add new
        else {
          users.push(updatedTrack);
        }

        await docRef.update({
          users,
        });

        dailyQuizData = users.filter(
          (u) => u.registration_id === registrationNo
        );
      }
    }
    let result = dailyQuizData;
    // if (!dailyQuizData || dailyQuizData.length === 0) {
    //   return res.status(404).send({ error: "No puzzle scores found" });
    // }

    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});
router.get("/getDailyQuizScore", async (req, res) => {
  try {
    const batchNo = req.query.batchNo;

    if (!batchNo) {
      return res.status(400).send({
        error: "batchNo is required",
      });
    }
    const collectionName = `daily-quiz-batch${batchNo == '6' ? '-'+batchNo : batchNo}`;
    const collectionRef = db.collection(collectionName);

    const quizObject = {
    };
    const pageSize = 20;
    let lastDoc = null;

    while (true) {
      let query = collectionRef
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(pageSize);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const quizSnapshot = await query.get();

      if (quizSnapshot.empty) {
        break;
      }

      quizSnapshot.forEach((doc) => {
        const users = doc.data().users || [];
        const uniqueUsersMap = new Map();

        users.forEach((user) => {
          const registrationId =
            user["Registration ID"] ||
            user["registration_id"];

          if (registrationId && !uniqueUsersMap.has(registrationId)) {
            uniqueUsersMap.set(registrationId, user);
          }
        });

        quizObject[doc.id] = Array.from(uniqueUsersMap.values());
      });

      lastDoc = quizSnapshot.docs[quizSnapshot.docs.length - 1];

      if (quizSnapshot.size < pageSize) {
        break;
      }
    }


    const dailyQuizFilePath = path.join(__dirname, "..", "daily_quiz_data.txt");
    const dailyQuizFileData = JSON.parse(
      fs.readFileSync(dailyQuizFilePath, "utf8")
    );

    dailyQuizFileData.forEach((dayData) => {
      Object.entries(dayData).forEach(([day, fileUsers]) => {
        const users = quizObject[day] || [];
        const uniqueUsersMap = new Map();

        [...users, ...fileUsers].forEach((user) => {
          const registrationId =
            user["Registration ID"] || user["registration_id"];

          if (registrationId && !uniqueUsersMap.has(registrationId)) {
            uniqueUsersMap.set(registrationId, user);
          }
        });

        quizObject[day] = Array.from(uniqueUsersMap.values());
      });
    });

    res.send({
      quizData: Object.keys(quizObject).length
        ? [quizObject]
        : [],
    });
  } catch (error) {
    console.error("Error retrieving daily quiz scores:", error);
    res.status(500).send({
      error: error.message,
    });
  }
});
router.get("/programDetails", async (req, res) => {
  try {
    const collectionName = "bible_study_programs";
    const programSnapshot = await db.collection(collectionName).get();
    let programDetails = [];
    if (programSnapshot && !programSnapshot.empty) {
      programSnapshot.forEach((doc) => {
        programDetails.push({ id: doc.id, ...doc.data() });
      });
      res.send({ programDetails: programDetails });
    } else {
      res.send({ programDetais: [] });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});

router.post("/createProgram", async (req, res) => {
  try {
    const collectionName = "bible_study_programs";
    const {
      online_quiz_results,
      batch_no,
      duration,
      online_quiz_tracking,
      final_quiz_result,
      daily_quiz,
      registration_link,
      status,
      address,
      online_quiz,
      schedule_dates,
      contact_no,
      language,
      type,
      final_quiz,
      whatsapp_group_link,
      church_name,
      schedule_link,
      no_chapters_per_day,
      conducting_by,
      programId,
      schedule,
    } = req.body;

    const startDate = schedule_dates && schedule_dates.start_date;
    const yearFromStartDate = String(startDate || "").match(/\b\d{4}\b/);
    const year = yearFromStartDate ? yearFromStartDate[0] : String(programId || "");

    if (!/^\d{4}$/.test(year)) {
      return res.status(400).send({
        error: "schedule_dates.start_date must include a four-digit year",
      });
    }

    const newProgram = {
      online_quiz_results,
      batch_no,
      duration,
      online_quiz_tracking,
      final_quiz_result,
      daily_quiz,
      registration_link,
      status,
      address,
      online_quiz,
      schedule_dates,
      contact_no,
      language,
      type,
      final_quiz,
      whatsapp_group_link,
      church_name,
      schedule_link,
      no_chapters_per_day,
      conducting_by,
      programId: programId || uuidv4(),
      createdAt: new Date(),
      schedule: schedule || [],
    };

    const docRef = db.collection(collectionName).doc(year);
    await docRef.set(
      { batches: admin.firestore.FieldValue.arrayUnion(newProgram) },
      { merge: true }
    );
    res.send({ id: docRef.id, ...newProgram });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});

router.post("/createSelfProgram", async (req, res) => {
      try {
          const collectionName = "self_study_programs";
          const {
              bibleType,
              durationType,
              startDate,
              endDate,
              schedule,
              totalDays,
              totalMonths,
              selectedBooks,
              createdBy,
             } = req.body;
          const newProgram = {
              programId: uuidv4(), 
              bibleType,
              durationType,
              startDate,
              endDate,
              schedule,
              totalDays,
              totalMonths,
              selectedBooks,
              createdBy,
              createdAt : new Date()
          }
          // Remove undefined values
          const cleanProgram = JSON.parse(JSON.stringify(newProgram));
          firstDocRef = db.collection(collectionName).doc(createdBy);
          const docSnapshot = await firstDocRef.get();
          if(docSnapshot.exists) {
              await firstDocRef.update({
                  programs: admin.firestore.FieldValue.arrayUnion(cleanProgram)
              })
          } else {
              await firstDocRef.set({
                  programs: [cleanProgram],
              })
          }
           let selfProgramDetails = [];
            const programSnapshot = await db.collection(collectionName).get(createdBy);
          if(programSnapshot && !programSnapshot.empty) {
            programSnapshot.forEach((doc) => {
              selfProgramDetails = doc.data().programs;
            });
          }
          res.send({
              message: "Successfully created your self Program",
              selfProgramDeatis: selfProgramDetails
          })
      } catch(error) {
          console.log(error);
          res.status(500).send({error: error.message});
      }
})
router.post("/getSelfPrograms", async(req, res) => {
  try {
    const userName = req.body.userName;
    const collectionName= "self_study_programs";
    const programSnapshot = await db.collection(collectionName).get(userName);
    let selfProgramDetails = [];
    if(programSnapshot && !programSnapshot.empty) {
      programSnapshot.forEach((doc) => {
        selfProgramDetails = doc.data().programs;
      });
      res.send({selfProgramDeatis: selfProgramDetails})
    } else {
      res.send({
        selfProgramDeatis: []
      })
    }
  } catch(error) {
    console.log(error);
    res.status(500).send(error.message)
  }
})
router.delete("/deleteSelfProgram", async (req, res) => {
  try {
    const id = req.query.id;
    const userName = req.query.userName; 
    
    if (!userName) {
      return res.status(400).send("userName is required");
    }

    const collectionName = "self_study_programs";
    
    // 1. Get a reference to the user's specific document
    const userDocRef = db.collection(collectionName).doc(userName);
    const userDoc = await userDocRef.get();

    // 2. Check if the document exists
    if (!userDoc.exists) {
      return res.status(404).send("User document not found.");
    }

    // 3. Extract the existing array (default to empty array if it doesn't exist)
    const currentPrograms = userDoc.data().programs || [];

    // 4. Filter out the object that matches the programId
    const updatedPrograms = currentPrograms.filter(program => program.programId !== id);

    // Check if anything was actually removed (optional, but good for returning accurate status)
    if (currentPrograms.length === updatedPrograms.length) {
      return res.status(404).send("No matching program ID found in the array.");
    }

    // 5. Update the document with the new array
    await userDocRef.update({
      programs: updatedPrograms
    });
    let selfProgramDetails = [];
            const programSnapshot = await db.collection(collectionName).get(userName);
          if(programSnapshot && !programSnapshot.empty) {
            programSnapshot.forEach((doc) => {
              selfProgramDetails = doc.data().programs;
            });
          }
    return res.status(200).send({ message: "Program removed from array successfully", selfProgramDetails: selfProgramDetails });
  } catch (error) {
    console.error("Error while deleting the Self Program:", error);
    return res.status(500).send(error.message);
  }
});
module.exports = router;
