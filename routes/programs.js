const express = require("express");
const router = express.Router();
const credentials = require("../config.js");
const fs = require("fs");
const multer = require("multer");
const cors = require("cors");
const bodyParser = require("body-parser");
const { result } = require("lodash");
const { google } = require("googleapis");
const admin = require("firebase-admin");
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
router.post("/api/proctor/frame", async (req, res) => {
  try {
    const collectionName = "proctor_frames";
    const frameData = {
      RegistrationID: req.body.regID || "Unknown",
      FrameData: req.body.frame || "",
      Timestamp: new Date().toISOString(),
      appType: req.body.appType || "UNKNOWN",
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
      appType: req.body.appType || "UNKNOWN",
    };
    const violationRef = db.collection(collectionName).doc();
    await violationRef.set(violationData);
    res.send({ message: "Proctor violation data submitted successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});
router.get("/getProctorViolations", async (req, res) => {
  try {
    const collectionName = "proctor_violations";
    const violationsSnapshot = await db.collection(collectionName).get();
    let violations = [];
    if (violationsSnapshot && !violationsSnapshot.empty) {
      violationsSnapshot.forEach((doc) => {
        violations.push({ id: doc.id, ...doc.data() });
      });

      res.send({ violations: violations });
    } else {
      res.send({ violations: [] });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});
router.get("/getPoctorFrames", async (req, res) => {
  try {
    const collectionName = "proctor_frames";
    const framesSnapshot = await db.collection(collectionName).get();
    let frames = [];
    if (framesSnapshot && !framesSnapshot.empty) {
      framesSnapshot.forEach((doc) => {
        frames.push({ id: doc.id, ...doc.data() });
      });
      res.send({ frames: frames });
    } else {
      res.send({ frames: [] });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
});
module.exports = router;