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
const { result } = require("lodash");
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
    let results = {}
    for (const doc of usersSnapshot) {
      let userData = { id: doc.id, ...doc.data() };
        if (userData['users'] && Array.isArray(userData['users'])) {
          userData['users'].sort((a, b) => {
            if (a["Reg No"] === undefined) return 1;
            if (b["Reg No"] === undefined) return -1;
            if (a["Reg No"] < b["Reg No"]) return -1;
            if (a["Reg No"] > b["Reg No"]) return 1;
            return 0;
          });
        }
      // }
        results[doc.id] = userData['users'] || [];
      users.push(userData);
    }

    res.send(results);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});
router.post("/login", async (req, res) => {
  try {
    const appType = req.body.appType;
    collectionName = appType === "NEW" ? "new_testament" : "old_new_testament";
    const registrationNo = req.body.regID;
    const usersSnapshot = await db.collection("USERS").get();
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
        RegID: userData["Reg No"],
        Name: userData["Full Name / పూర్తి పేరు"],
        Church: userData["Church Name / సంఘము పేరు"],
        Contact: userData["Contact No / ఫోన్ నెం"],
        Village: userData["Village Name / ఊరి పేరు"],
        Occupation: userData["Occupation / వృత్తి"],
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
router.post("/getPuzzleScore", async (req, res) => {
  try {
    const appType = req.body.appType;
    const collectionName =
      appType === "NEW" ? "puzzle_results_new" : "puzzle_results_old_new";
    const puzzleSnapshot = await db.collection(collectionName).get();
    let puzzles = [...puzzleSnapshot.docs].map((doc) => {
      let object = {};
      object[doc.id] = doc.data().users;
      return object;
    });
    if (!puzzles || puzzles.length === 0) {
      return res.status(404).send({ error: "No puzzle scores found" });
    }
    let result = {};
    puzzles.map((puzzle) => {
      const key = Object.keys(puzzle)[0];
      let value = puzzle[key];
      // const obj = {};
      value = value.map((item, index) => {
        return {
          SNO: item["S.No"],
          RegistrationID: item["Registered No"],
          YourScore: item["Scored Marks"],
          TotalScore: item["Total Marks"],
        };
      });
      result[key] = value;
      // result.push(obj);
    });

    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});
router.post("/track", async (req, res) => {
  try { 
  //    const req = {
  //  "RegistrationID": this.userDetails?.RegID,
  //   "Name": this.userDetails?.Name,
  //   "Quiz ID": chapterName,
  //   "Attempted": true,
  //   "Date": new Date()
  // }
    const isFinalQuiz = req.body.finalQuiz || false;
    const appType = req.body.appType;
    const collectionName = 
      isFinalQuiz ? 'final_quiz_tracker' :
      appType === "NEW" ? "online_quiz_tracker_new" : "online_quiz_tracker_old_new";
    const registrationNo = req.body.regID;
    const puzzleSnapshot = await db.collection(collectionName).get();
    let puzzles = [];
    puzzleSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.users && Array.isArray(data.users)) {
        const userTrack = data.users.find(u => u["registration_id"] === registrationNo);
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
        "Date": new Date().toISOString()
      };
      // Replace slashes in quizID to ensure valid Firestore document ID
      const safeQuizID = req.body.quizID.replace(/\//g, "");
      const firstDocRef = db.collection(collectionName).doc(safeQuizID);
      // Add to the first document in the collection, or create a new doc
      // Check if the document exists before updating
      const docSnapshot = await firstDocRef.get();
      if (docSnapshot.exists) {
        await firstDocRef.update({
          users: admin.firestore.FieldValue.arrayUnion(newTrack)
        });
      } else {
        // If doc does not exist, create it with the new user
        await firstDocRef.set({
          users: [newTrack]
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
    const appType = req.body.appType;
    const isFinalQuiz = req.body.finalQuiz || false;
    const collectionName =
      isFinalQuiz ? 'final_quiz_tracker' :
      appType === "NEW" ? "online_quiz_tracker_new" : "online_quiz_tracker_old_new";
    const registrationNo = req.body.regID;
    const puzzleSnapshot = await db.collection(collectionName).get();
    let puzzles = [];
    puzzleSnapshot.forEach(doc => {
      const data = doc.data();
      if(doc.id &&  req.body.quizID && doc.id === req.body.quizID.replace(/\//g, "")) {
      if (data.users && Array.isArray(data.users)) {
        const userTrack = data.users.find(u => u["Registration ID"] === registrationNo);
        if (userTrack) {
          puzzles.push(userTrack);
        }
      }
    }
    });

    if (!puzzles || puzzles.length === 0) {
      return res.send({ isAttempted: false, error: "No quiz tracker found for this user" });
    }

    res.send({  isAttempted: true, user: puzzles[0] });
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
      Date: new Date().toISOString()
    };
    const prayerRef = db.collection(collectionName).doc();
    await prayerRef.set(prayerData);
    res.send({ message: "Prayer request submitted successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  } 
});
router.post("/api/proctor/frame", async (req, res) => {
  try {
    const collectionName = "proctor_frames";  
    const frameData = {
      RegistrationID: req.body.regID || "Unknown",
      FrameData: req.body.frame || "",
      Timestamp: new Date().toISOString(),
      appType: req.body.appType || "UNKNOWN"
    };
    const frameRef = db.collection(collectionName).doc();
    await frameRef.set(frameData);
    res.send({ message: "Proctor frame data submitted successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});

router.post("/api/proctor/violation", async (req, res) => {
  try {
    const collectionName = "proctor_violations";  
    const violationData = { 
      RegistrationID: req.body.regID || "Unknown",
      ViolationType: req.body.reason || "Unknown",
      Timestamp: new Date().toISOString(),
      appType: req.body.appType || "UNKNOWN"
    };
    const violationRef = db.collection(collectionName).doc();
    await violationRef.set(violationData);
    res.send({ message: "Proctor violation data submitted successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});

module.exports = router;
